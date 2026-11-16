"""Small functional retrieval test, not a general ranking-quality benchmark."""
import json
import time
from datetime import datetime, timezone
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from dotenv import load_dotenv
load_dotenv(ROOT/'.env')
from awe_ti.semantic import semantic_rank

examples=[
 {'id':'html','name':'HTML extraction','description':'Parse web pages and extract links and text from HTML documents. Парсинг веб-страниц и извлечение текста и ссылок.','capabilities':['web_scraping','html_parsing']},
 {'id':'db','name':'PostgreSQL storage','description':'Relational database storage with SQL transactions and persistent data. Реляционная база данных, хранение записей, транзакции SQL.','capabilities':['database','postgresql']},
 {'id':'image','name':'Image generator','description':'Generate pictures and visual artwork from prompts. Генерация изображений и иллюстраций.','capabilities':['image_generation']},
 {'id':'speech','name':'Speech recognition','description':'Transcribe speech audio files into written text. Распознавание речи и транскрибация аудио.','capabilities':['speech_to_text']}
]
cases=[('Достать ссылки и текст из веб-страницы','html'),('Keep catalog records durably in a SQL database','db'),('Превратить голосовую запись в текст','speech')]
results=[]
start=time.monotonic()
for query,expected in cases:
    ranked=semantic_rank(query,examples,limit=2)
    results.append({'query':query,'expected':expected,'top_id':ranked[0]['id'],
                    'passed':ranked[0]['id']==expected,
                    'ranked':[{'id':r['id'],'score':r['semantic_similarity']} for r in ranked]})
record={'tested_at':datetime.now(timezone.utc).isoformat(),'model':'minishlab/potion-multilingual-128M',
        'method':'actual local static embeddings and cosine similarity',
        'test_scope':'controlled four-resource fixture; not production recall benchmark',
        'duration_seconds':round(time.monotonic()-start,3),'cases':results,
        'passed':all(x['passed'] for x in results)}
(ROOT/'evidence/live-semantic.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(record,ensure_ascii=False,indent=2))
if not record['passed']:
    raise SystemExit(1)
