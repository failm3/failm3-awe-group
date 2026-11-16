"""Optional local multilingual static-embedding retrieval, no remote model code.

Capability/cost/permission gates belong to the registry and must filter candidates
before ranking. Similarity is relevance, never evidence of approval or correctness.
"""
import hashlib
import os
import threading
from collections import OrderedDict
from pathlib import Path

class SemanticUnavailable(RuntimeError):
    pass

_lock = threading.RLock()
_model = None
_model_path = None
_cache = OrderedDict()
_MAX_CACHE = 20000


def _load():
    global _model, _model_path
    configured = os.environ.get('SEMANTIC_MODEL_PATH')
    if not configured:
        raise SemanticUnavailable('SEMANTIC_MODEL_PATH is not configured; no embedding model loaded')
    path = Path(configured)
    if not path.is_dir() or not (path/'model.safetensors').is_file():
        raise SemanticUnavailable('Reviewed local safetensors model missing; run setup_semantic_model.py')
    with _lock:
        if _model is None or _model_path != str(path.resolve()):
            try:
                from model2vec import StaticModel
                _model = StaticModel.from_pretrained(str(path.resolve()))
            except Exception as exc:
                raise SemanticUnavailable(f'Cannot load local embedding model: {type(exc).__name__}') from exc
            _model_path = str(path.resolve())
            _cache.clear()
        return _model


def resource_text(resource):
    tags = resource.get('capabilities') or resource.get('capability_tags') or []
    if isinstance(tags, str):
        tags = [tags]
    return (' '.join([str(resource.get('name') or ''), str(resource.get('description') or ''),
                     ' '.join(str(x) for x in tags)]))[:12000]


def semantic_rank(query: str, resources: list[dict], limit=10) -> list[dict]:
    if not query.strip():
        return []
    if not resources:
        return []
    import numpy as np
    model = _load()
    texts = [resource_text(r) for r in resources]
    with _lock:
        vectors=[]
        for text in texts:
            key=hashlib.sha256((_model_path+'\n'+text).encode()).hexdigest()
            if key not in _cache:
                value=np.asarray(model.encode([text])[0], dtype=np.float32)
                value /= max(float(np.linalg.norm(value)), 1e-12)
                _cache[key]=value
                if len(_cache)>_MAX_CACHE:
                    _cache.popitem(last=False)
            else:
                _cache.move_to_end(key)
            vectors.append(_cache[key])
        q=np.asarray(model.encode([query[:4000]])[0],dtype=np.float32)
        q /= max(float(np.linalg.norm(q)),1e-12)
    scores=np.stack(vectors)@q
    order=np.argsort(-scores, kind='stable')[:max(1,min(int(limit),100))]
    return [{**resources[int(i)], 'semantic_similarity': round(float(scores[i]),6),
             'ranking_method':'model2vec_cosine', 'embedding_model':'minishlab/potion-multilingual-128M'}
            for i in order]
