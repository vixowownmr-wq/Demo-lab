import { openDB } from 'idb'

const dbPromise = openDB('demolab-db', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('audios')) {
      db.createObjectStore('audios')
    }
  }
})

export async function saveAudio(id, file) {
  const db = await dbPromise
  await db.put('audios', file, id)
}

export async function getAudio(id) {
  const db = await dbPromise
  return await db.get('audios', id)
}

export async function deleteAudio(id) {
  const db = await dbPromise
  await db.delete('audios', id)
}