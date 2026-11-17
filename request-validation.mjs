const invalid = message => Object.assign(new Error(message), {status: 400});
export function validateChatPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid('Expected a message object.');
  if (typeof data.message !== 'string' || !data.message.trim() || data.message.length > 10000) throw invalid('Enter a message under 10,000 characters.');
  for (const field of ['history', 'tasks', 'attachments']) if (data[field] !== undefined && !Array.isArray(data[field])) throw invalid(field + ' must be an array.');
  if ((data.history || []).some(x => !x || typeof x !== 'object' || !['user', 'assistant'].includes(x.role) || typeof x.text !== 'string')) throw invalid('Invalid conversation history.');
  if ((data.tasks || []).length > 100 || (data.tasks || []).some(t => !t || typeof t !== 'object' || typeof t.text !== 'string' || t.text.length > 10000)) throw invalid('Provide up to 100 valid tasks.');
  if ((data.attachments || []).length > 10 || (data.attachments || []).some(id => typeof id !== 'string' || id.length > 80)) throw invalid('Invalid attachment list.');
  if(data.activeFile!=null&&(typeof data.activeFile!=='object'||Array.isArray(data.activeFile)||(data.activeFile.url!==undefined&&(typeof data.activeFile.url!=='string'||data.activeFile.url.length>2048))||(data.activeFile.id!==undefined&&(typeof data.activeFile.id!=='string'||data.activeFile.id.length>80))||(data.activeFile.chatId!==undefined&&(typeof data.activeFile.chatId!=='string'||data.activeFile.chatId.length>80))))throw invalid('Invalid open-file reference.');
  if(data.activeFileDirty!==undefined&&typeof data.activeFileDirty!=='boolean')throw invalid('Invalid editor state.');
  return {...data, history: (data.history || []).slice(-80).map(x => ({role: x.role, text: x.text.slice(0,8000)})), tasks: (data.tasks || []).map(t => ({text: t.text.slice(0,1000), done: !!t.done}))};
}
