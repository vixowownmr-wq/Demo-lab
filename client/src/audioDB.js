import { openDB } from 'idb'

const dbPromise = openDB('demolab-db', 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('audios')) {
      db.createObjectStore('audios')
    }

    if (!db.objectStoreNames.contains('covers')) {
      db.createObjectStore('covers')
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

export async function getAllAudioKeys() {
  const db = await dbPromise
  return await db.getAllKeys('audios')
}

export async function saveCover(id, file) {
   const db = await dbPromise
   await db.put('covers', file, id)
}

export async function getCover(id) {
  const db = await dbPromise
  return await db.get('covers', id)
}

export async function deleteCover(id) {
  const db = await dbPromise
  await db.delete('covers', id)
}