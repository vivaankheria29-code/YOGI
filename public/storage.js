let database;
function open() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open('yogi-workspace', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close older YOGI tabs to finish opening saved history.'));
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); database = null; }; resolve(db); };
  }).catch(error => { database = null; throw error; });
  return database;
}
export async function loadWorkspace() {
  try {
    const db = await open();
    const state = await new Promise((resolve, reject) => { const req = db.transaction('state').objectStore('state').get('workspace'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    return {state: state || null, error: null};
  } catch (error) { return {state: null, error}; }
}
let writes = Promise.resolve();
export function saveWorkspace(state) {
  const snapshot = structuredClone(state);
  const write = writes.catch(() => {}).then(async () => {
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put(snapshot, 'workspace');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Saving was interrupted.'));
    });
  });
  writes = write; return write;
}
