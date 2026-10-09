// Fixed endpoints keep each provider's credentials on its own service.
function keyField(provider){return provider==='gemini'?'geminiKey':provider==='experiential'?'experientialKey':'openaiKey';}
function apiBase(provider){return provider==='experiential'?'https://api.experientiallabs.ai/v1':'https://api.openai.com/v1';}
function retainKeys(previous,input){return Object.fromEntries(['geminiKey','openaiKey','experientialKey'].map(key=>[key,input[key]===undefined?previous[key]:input[key]]));}
module.exports={keyField,apiBase,retainKeys};
