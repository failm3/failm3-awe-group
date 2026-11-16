function readInput(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => Object.fromEntries(line.split('|').map(part => part.split('='))));
}
module.exports = { readInput };
