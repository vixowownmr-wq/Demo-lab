import { useState, useRef, useEffect } from 'react'
import Wavesurfer from 'wavesurfer.js'
import {
  saveAudio,
  getAudio,
  deleteAudio,
  getAllAudioKeys,
  saveCover,
  getCover,
  deleteCover
} from './audioDB'
import './App.css'

function ProjectCover({ project }) {
  const [coverUrl, setCoverUrl] = useState(null)

  useEffect(() => {
    let objectUrl

    async function loadCover() {
      const coverFile = await getCover(project.id)

      if (!coverFile) {
        setCoverUrl(null)
        return
      }

      objectUrl = URL.createObjectURL(coverFile)

      setCoverUrl(objectUrl)
    }

    loadCover()

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [project.id])

  if (!coverUrl) {
    return (
      <div className="project-cover">
        🎵
      </div>
    )
  }

  return (
    <div className="project-cover">
      <img
        src={coverUrl}
        alt={`Portada de ${project.name}`}
      />
    </div>
  )
}

// Comparador A/B sincronizado: audio cargado desde IndexedDB con sus IDs originales.
function VersionComparator({ versions }) {
  const [idA, setIdA] = useState(String(versions.at(-2)?.id ?? ''))
  const [idB, setIdB] = useState(String(versions.at(-1)?.id ?? ''))
  const [active, setActive] = useState('A')
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [durations, setDurations] = useState({ A: 0, B: 0 })
  const [volumes, setVolumes] = useState({ A: 100, B: 100 })
  const [urls, setUrls] = useState({ A: '', B: '' })
  const [error, setError] = useState('')
  const audioA = useRef(null)
  const audioB = useRef(null)
  const activeRef = useRef('A')
  const actionId = useRef(0)
  const switchingRef = useRef(false)
  const positionRef = useRef(0)
  const durationRef = useRef({ A: 0, B: 0 })

  const commonDuration = durations.A > 0 && durations.B > 0
    ? Math.min(durations.A, durations.B)
    : 0
  const ready = Boolean(urls.A && urls.B && commonDuration > 0)
  const unequalDurations = ready && Math.abs(durations.A - durations.B) > 0.5

  function players() { return { A: audioA.current, B: audioB.current } }
  function syncPosition(time) {
    positionRef.current = time
    setPosition(time)
  }
  function clamp(time, max) {
    return Math.max(0, Math.min(time, Math.max(0, max - 0.05)))
  }
  function stopPlayers() {
    actionId.current += 1
    audioA.current?.pause()
    audioB.current?.pause()
    switchingRef.current = false
    setPlaying(false)
  }

  useEffect(() => {
    let cancelled = false
    const allocated = []
    async function load() {
      stopPlayers()
      setError('')
      setUrls({ A: '', B: '' })
      setDurations({ A: 0, B: 0 })
      durationRef.current = { A: 0, B: 0 }
      syncPosition(0)
      const vA = versions.find(v => String(v.id) === idA)
      const vB = versions.find(v => String(v.id) === idB)
      if (!vA || !vB) { setError('Las versiones seleccionadas ya no existen.'); return }
      // No convertir los IDs a números: IndexedDB distingue entre 123 y "123".
      const [blobA, blobB] = await Promise.all([getAudio(vA.id), getAudio(vB.id)])
      if (cancelled) return
      if (!blobA || !blobB) {
        setError('No se encontró uno de los audios en IndexedDB. Intenta abrir ambas versiones por separado.')
        return
      }
      allocated.push(URL.createObjectURL(blobA), URL.createObjectURL(blobB))
      if (!cancelled) setUrls({ A: allocated[0], B: allocated[1] })
    }
    load().catch(err => {
      console.error('Error al cargar el comparador A/B:', err)
      if (!cancelled) setError('Error leyendo los audios. Revisa la consola (F12).')
    })
    return () => {
      cancelled = true
      actionId.current += 1
      allocated.forEach(url => URL.revokeObjectURL(url))
    }
  }, [idA, idB, versions])

  useEffect(() => () => {
    audioA.current?.pause()
    audioB.current?.pause()
  }, [])

  useEffect(() => {
    if (audioA.current) audioA.current.volume = volumes.A / 100
    if (audioB.current) audioB.current.volume = volumes.B / 100
  }, [volumes, urls])

  function onMetadata(side, event) {
    const length = event.currentTarget.duration
    if (!Number.isFinite(length) || length <= 0) {
      setError(`No se puede leer la duración del audio ${side}.`)
      return
    }
    durationRef.current = { ...durationRef.current, [side]: length }
    setDurations({ ...durationRef.current })
    event.currentTarget.currentTime = 0
  }

  async function switchTo(next) {
    if (next === activeRef.current || !ready || switchingRef.current) return
    switchingRef.current = true
    const ticket = ++actionId.current
    const currentSide = activeRef.current
    const p = players()
    const source = p[currentSide]
    const destination = p[next]
    const resume = source && !source.paused && !source.ended
    // Capturar el tiempo antes de pausar: es la referencia para ambas mezclas.
    const aligned = clamp(source?.currentTime ?? positionRef.current, commonDuration)
    source?.pause()
    destination.pause()
    destination.currentTime = aligned
    activeRef.current = next
    setActive(next)
    syncPosition(aligned)
    try {
      if (resume) {
        await destination.play()
        if (ticket !== actionId.current) { destination.pause(); return }
        setPlaying(true)
      } else {
        setPlaying(false)
      }
    } catch (err) {
      console.error('No se pudo alternar la reproducción A/B:', err)
      setPlaying(false)
      setError('No se pudo reproducir esta versión. Intenta presionar Reproducir.')
    } finally {
      switchingRef.current = false
    }
  }

  async function togglePlayback() {
    if (!ready || switchingRef.current) return
    const p = players()[activeRef.current]
    if (!p) return
    const ticket = ++actionId.current
    if (!p.paused) {
      p.pause()
      setPlaying(false)
      return
    }
    if (p.currentTime >= commonDuration - 0.04) seek(0)
    try {
      await p.play()
      if (ticket !== actionId.current) { p.pause(); return }
      setPlaying(true)
      setError('')
    } catch (err) {
      console.error('No se pudo reproducir:', err)
      setPlaying(false)
      setError('El navegador no pudo reproducir el audio seleccionado.')
    }
  }

  function seek(value) {
    if (!ready) return
    const newPosition = clamp(Number(value), commonDuration)
    for (const player of Object.values(players())) {
      if (player && player.readyState >= 1) player.currentTime = newPosition
    }
    syncPosition(newPosition)
  }

  function onTimeUpdate(side, event) {
    if (side !== activeRef.current || !ready) return
    const player = event.currentTarget
    if (player.currentTime >= commonDuration - 0.025) {
      player.pause()
      setPlaying(false)
      seek(commonDuration)
      return
    }
    syncPosition(player.currentTime)
  }

  function timeLabel(seconds) {
    if (!Number.isFinite(seconds)) return '0:00'
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  }

  const choices = versions.map(v => ({
    value: String(v.id),
    label: `v${v.number ?? '?'}${v.label ? ` · ${v.label}` : ''}`
  }))

  return (
    <section className="ab-comparator" aria-label="Comparador de versiones A/B">
      <div className="ab-heading">
        <div><h2>Comparador A/B</h2><p>Alterna entre versiones desde el mismo punto de la canción.</p></div>
        <span className="ab-tag">Escucha crítica</span>
      </div>
      <div className="ab-selectors">
        <label>Versión A
          <select value={idA} onChange={e => setIdA(e.target.value)}>
            {choices.map(opt => <option key={opt.value} value={opt.value} disabled={opt.value === idB}>{opt.label}</option>)}
          </select>
        </label>
        <label>Versión B
          <select value={idB} onChange={e => setIdB(e.target.value)}>
            {choices.map(opt => <option key={opt.value} value={opt.value} disabled={opt.value === idA}>{opt.label}</option>)}
          </select>
        </label>
      </div>
      <audio ref={audioA} src={urls.A || undefined} preload="auto"
        onLoadedMetadata={event => onMetadata('A', event)}
        onTimeUpdate={event => onTimeUpdate('A', event)}
        onEnded={() => { if (activeRef.current === 'A') setPlaying(false) }} />
      <audio ref={audioB} src={urls.B || undefined} preload="auto"
        onLoadedMetadata={event => onMetadata('B', event)}
        onTimeUpdate={event => onTimeUpdate('B', event)}
        onEnded={() => { if (activeRef.current === 'B') setPlaying(false) }} />
      <div className="ab-controls">
        <button type="button" className="ab-play" onClick={togglePlayback} disabled={!ready}>{playing ? '⏸ Pausar' : '▶ Reproducir'}</button>
        <div className="ab-toggle" role="group" aria-label="Versión audible">
          <button type="button" aria-pressed={active === 'A'} className={active === 'A' ? 'selected' : ''} onClick={() => switchTo('A')} disabled={!ready}>A</button>
          <button type="button" aria-pressed={active === 'B'} className={active === 'B' ? 'selected' : ''} onClick={() => switchTo('B')} disabled={!ready}>B</button>
        </div>
        <span className="ab-time">{timeLabel(position)} / {timeLabel(commonDuration)}</span>
      </div>
      <input className="ab-seek" aria-label="Posición de reproducción" type="range" min="0" max={Math.max(commonDuration, 0.01)} step="0.05" value={Math.min(position, Math.max(commonDuration, 0.01))} onChange={event => seek(event.target.value)} disabled={!ready} />
      <div className="ab-volumes">
        {['A', 'B'].map(side => (
          <label key={side}>Volumen {side} · {volumes[side]}%
            <input type="range" min="0" max="100" value={volumes[side]} onChange={event => setVolumes(current => ({ ...current, [side]: Number(event.target.value) }))} />
          </label>
        ))}
      </div>
      {unequalDurations && <p className="ab-duration-note">Las versiones duran {timeLabel(durations.A)} y {timeLabel(durations.B)}. La comparación se limita al tramo compartido ({timeLabel(commonDuration)}).</p>}
      {!ready && !error && <p className="ab-hint">Preparando audios para comparar…</p>}
      {error && <p className="ab-error" role="alert">{error}</p>}
      <p className="ab-hint">La posición se conserva al alternar. La transición puede producir una pausa breve. El ajuste de volumen es manual, no una normalización LUFS.</p>
    </section>
  )
}

function App() {

  const waveformRef = useRef(null)
  const wavesurferRef = useRef(null)
  
  const releaseAudioRef = useRef(null)
  const releaseUrlRef = useRef(null)

  const [releaseQueue, setReleaseQueue] = useState([])

  const [releaseIndex, setReleaseIndex] = useState(-1)

  const [isReleasePlaying, setIsReleasePlaying] = useState(false)

  const [releaseCurrentTime, setReleaseCurrentTime] = useState(0)

  const [releaseDuration, setReleaseDuration] = useState(0)


  const [currentTime, setCurrentTime] = useState(0)

  const [duration, setDuration] = useState(0)

//estado para saber si está reproduciendo
  const [isPlaying, setIsPlaying] = useState(0)

  const [showForm, setShowForm] = useState(false)

  const [projectCover, setProjectCover] = useState(null)

  const [projectName, setProjectName] = useState('')

  const [projectType, setProjectType] = useState('single')

  const [selectedProject, setSelectedProject] = useState(null)
  const [showProjectSettings, setShowProjectSettings] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState('')

  const [selectedTrack, setSelectedTrack] = useState(null)

  const [trackName, setTrackName] = useState('')

  const [editingTrackId, setEditingTrackId] = useState(null)

  const [editingTrackName, setEditingTrackName] = useState('')

  const [selectedVersion, setSelectedVersion] = useState(null)

  const [editingVersionId, setEditingVersionId] = useState(null)

  const [versionLabel, setVersionLabel] = useState('')

  const [commentText, setCommentText] = useState('')
  const [commentFilter, setCommentFilter] = useState('all')
  const [pendingUpload, setPendingUpload] = useState(null)
  const [changeLog, setChangeLog] = useState('')
  const [linkedCommentIds, setLinkedCommentIds] = useState([])
  const [savingRevision, setSavingRevision] = useState(false)
  const [reviewMode, setReviewMode] = useState(() => localStorage.getItem('demolab-review-mode') === 'artist')

  useEffect(() => {
    localStorage.setItem('demolab-review-mode', reviewMode ? 'artist' : 'studio')
  }, [reviewMode])



  const [projects, setProjects] = useState(() => {
    const savedProjects = localStorage.getItem('demolab-projects')

    if (savedProjects) {
      return JSON.parse(savedProjects)
    }

    return []
  })

  // Historial local: se registra únicamente a partir de esta versión.
  const [activity, setActivity] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('demolab-activity') ?? '[]')
      return Array.isArray(saved) ? saved : []
    } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem('demolab-activity', JSON.stringify(activity))
  }, [activity])

  function recordActivity(type, project, description, trackId = null) {
    if (!project) return
    const entry = {
      id: crypto.randomUUID(),
      type,
      projectId: project.id,
      projectName: project.name,
      trackId,
      description,
      at: new Date().toISOString()
    }
    setActivity(current => [entry, ...current].slice(0, 100))
  }

  function openActivity(entry) {
    const project = projects.find(p => p.id === entry.projectId)
    if (!project) return
    setSelectedVersion(null)
    setSelectedProject(project)
    setSelectedTrack(project.tracks?.find(t => t.id === entry.trackId) ?? null)
  }

  async function cleanOrphanAudios() {
    const validAudioIds = new Set()

    for (const project of projects) {
      for (const version of project.versions ?? []) {
        validAudioIds.add(version.id)
      }

      for (const track of project.tracks ?? []) {
        for (const version of track.versions ?? []) {
          validAudioIds.add(version.id)
        }
      }
    }

    const storedAudioIds = await getAllAudioKeys()

    const orphanAudioIds = storedAudioIds.filter(
      (id) => !validAudioIds.has(id)
    )

    for (const id of orphanAudioIds) {
      await deleteAudio(id)
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject

      reader.readAsDataURL(blob)
    })
  }

  async function handleCoverUpload(event) {
    const file = event.target.files[0]

    if (!file || !selectedProject) {
      return
    }

    await saveCover(selectedProject.id, file)

    const coverUrl = URL.createObjectURL(file)

    const updatedProject = {
      ...selectedProject,
      cover: coverUrl
    }

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === selectedProject.id
          ? updatedProject
          : project
      )
    )

    setSelectedProject(updatedProject)
    setProjectCover(coverUrl)
  }

    useEffect(() => {
      async function loadCover() {
        if (!selectedProject) {
          setProjectCover(null)
          return
        }

        const coverFile = await getCover(selectedProject.id)

        if (!coverFile) {
          setProjectCover(null)
          return
        }

        const coverUrl = URL.createObjectURL(coverFile)

        setProjectCover(coverUrl)
      }

      loadCover()
    }, [selectedProject?.id])



  async function exportBackup() {
    const audioIds = new Set()

    const projectsForBackup = projects.map((project) => ({
      ...project,

      versions: (project.versions ?? []).map((version) => {
        audioIds.add(version.id)

        return {
          ...version,
          audio: null
        }
      }),

      tracks: (project.tracks ?? []).map((track) => ({
        ...track,

        versions: (track.versions ?? []).map((version) => {
          audioIds.add(version.id)

          return {
            ...version,
            audio: null
          }
        })
      }))
    }))

    const audios = []

    for (const id of audioIds) {
      const audioFile = await getAudio(id)

      if (!audioFile) continue

      const data = await blobToBase64(audioFile)

      audios.push({
        id,
        data,
        type: audioFile.type ?? 'audio/mpeg'
      })
    }

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      projects: projectsForBackup,
      activity,
      audios
    }

    const blob = new Blob(
      [JSON.stringify(backup)],
      { type: 'application/json' }
    )

    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')

    link.href = url
    link.download = `demolab-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`

    link.click()

    URL.revokeObjectURL(url)
  }

  function buildReleaseQueue() {
    return (selectedProject.tracks ?? [])
      .filter((track) => track.versions?.length > 0)
      .map((track) => {
        const latestVersion =
          track.versions[track.versions.length - 1]

        return {
          trackId: track.id,
          trackName: track.name,
          versionId: latestVersion.id,
          versionNumber: latestVersion.number,
          versionLabel: latestVersion.label ?? ''
        }
      })
  }


  async function loadReleaseTrack(queue, index, autoplay = true) {
    const item = queue[index]

    if (!item) {
      return
    }

    const audioFile = await getAudio(item.versionId)

    if (!audioFile) {
      console.error(
        `No se encontró el audio de ${item.trackName}`
      )

      return
    }

    if (releaseUrlRef.current) {
      URL.revokeObjectURL(releaseUrlRef.current)
    }

    const audioUrl = URL.createObjectURL(audioFile)

    releaseUrlRef.current = audioUrl

    setReleaseIndex(index)
    setReleaseCurrentTime(0)

    const audio = releaseAudioRef.current

    if (!audio) {
      return
    }

    audio.src = audioUrl
    audio.load()

    if (autoplay) {
      try {
        await audio.play()
        setIsReleasePlaying(true)
      } catch (error) {
        console.error('No se pudo reproducir:', error)
        setIsReleasePlaying(false)
      }
    }
  }


  async function playRelease() {
    const queue = buildReleaseQueue()

    if (queue.length === 0) {
      alert(
        'Todavía no hay canciones con audio para reproducir.'
      )
      return
    }

    setReleaseQueue(queue)

    await loadReleaseTrack(queue, 0, true)
  }


  function toggleReleasePlayback() {
    const audio = releaseAudioRef.current

    if (!audio) {
      return
    }

    if (audio.paused) {
      audio.play()
      setIsReleasePlaying(true)
    } else {
      audio.pause()
      setIsReleasePlaying(false)
    }
  }


  async function nextReleaseTrack() {
    const nextIndex = releaseIndex + 1

    if (nextIndex >= releaseQueue.length) {
      setIsReleasePlaying(false)
      setReleaseIndex(-1)
      return
    }

    await loadReleaseTrack(
      releaseQueue,
      nextIndex,
      true
    )
  }


  async function previousReleaseTrack() {
    if (releaseIndex <= 0) {
      return
    }

    await loadReleaseTrack(
      releaseQueue,
      releaseIndex - 1,
      true
    )
  }


  function handleReleaseSeek(event) {
    const audio = releaseAudioRef.current

    if (!audio) {
      return
    }

    const newTime = Number(event.target.value)

    audio.currentTime = newTime
    setReleaseCurrentTime(newTime)
  }

    async function importBackup(event) {
      const file = event.target.files[0]

      if (!file) return

      try {
        const text = await file.text()
        const backup = JSON.parse(text)

        if (
          !backup ||
          !Array.isArray(backup.projects) ||
          !Array.isArray(backup.audios)
        ) {
          alert('El archivo no parece ser un respaldo válido de DemoLab.')
          return
        }

        const confirmImport = window.confirm(
          'Importar este respaldo reemplazará los proyectos y audios actuales. ¿Quieres continuar?'
        )

        if (!confirmImport) {
          event.target.value = ''
          return
        }

        // Eliminar audios actuales
        const currentAudioIds = await getAllAudioKeys()

        for (const id of currentAudioIds) {
          await deleteAudio(id)
        }

        // Restaurar audios del respaldo
        for (const audio of backup.audios) {
          const response = await fetch(audio.data)
          const blob = await response.blob()

          await saveAudio(audio.id, blob)
        }

        // Restaurar proyectos
        setProjects(backup.projects)
        setActivity(Array.isArray(backup.activity) ? backup.activity : [])

        setSelectedProject(null)
        setSelectedTrack(null)
        setSelectedVersion(null)

        alert('✅ Respaldo restaurado correctamente.')
      } catch (error) {
        console.error(error)

        alert('No se pudo importar el respaldo.')
      }

      event.target.value = ''
    }

    useEffect(() => {
    async function runCleanup() {
      const cleanupDone = localStorage.getItem('demolab-cleanup-v2')

      if (cleanupDone) {
        return
      }

      await cleanOrphanAudios()

      localStorage.setItem('demolab-cleanup-v2', 'true')
    }

    runCleanup()
  }, [])


  function createProject() {
    if(projectName.trim() === '') {
      return
    }

    const newProject = {
      id: Date.now(),
      name: projectName,
      type: projectType,
      comments: 0,
      versions: [],
      tracks: [],
      nextVersionNumber: 1
    }

    setProjects([...projects, newProject])
    recordActivity('project', newProject, 'Proyecto creado')
    setProjectName('')
    setProjectType('single')
    setShowForm(false)
  }
  function openProjectSettings() {
    setProjectNameDraft(selectedProject?.name ?? '')
    setShowProjectSettings(true)
  }

  function saveProjectName() {
    if (!selectedProject) return
    const name = projectNameDraft.trim()
    if (!name) {
      alert('Escribe un nombre para el proyecto.')
      return
    }
    const updatedProject = { ...selectedProject, name }
    setProjects(current => current.map(project =>
      project.id === selectedProject.id ? updatedProject : project
    ))
    setSelectedProject(updatedProject)
  }

  // Cambiar el tipo conservando los audios y sus metadatos.
  // En DemoLab, sencillos/beats guardan versiones en project.versions;
  // EP/álbumes guardan versiones dentro de project.tracks.
  function changeProjectType(nextType) {
    const allowedTypes = ['single', 'ep', 'album', 'beat']
    if (!selectedProject || !allowedTypes.includes(nextType)) return

    const oldType = selectedProject.type
    if (nextType === oldType) return

    const wasRelease = oldType === 'ep' || oldType === 'album'
    const willBeRelease = nextType === 'ep' || nextType === 'album'
    const currentTracks = selectedProject.tracks ?? []
    const currentVersions = selectedProject.versions ?? []
    let updatedProject = { ...selectedProject, type: nextType }

    if (wasRelease && !willBeRelease) {
      if (currentTracks.length > 1) {
        alert('Este proyecto tiene varias canciones. Para convertirlo en sencillo o beat debe tener como máximo una. No se ha cambiado ni eliminado ningún dato.')
        return
      }
      if (currentTracks.length === 1 && currentVersions.length > 0) {
        alert('Hay versiones guardadas tanto en el proyecto como en su canción. Para evitar perder datos, no se puede convertir automáticamente.')
        return
      }
      const track = currentTracks[0]
      updatedProject = {
        ...updatedProject,
        versions: track ? (track.versions ?? []) : currentVersions,
        nextVersionNumber: track
          ? (track.nextVersionNumber ?? (track.versions?.length ?? 0) + 1)
          : (selectedProject.nextVersionNumber ?? currentVersions.length + 1),
        tracks: [],
        // Conservamos nombre, ID y estado para volver a EP/álbum sin perderlos.
        singleTrackInfo: track
          ? { id: track.id, name: track.name, status: track.status }
          : (selectedProject.singleTrackInfo ?? null)
      }
    } else if (!wasRelease && willBeRelease) {
      if (currentTracks.length > 0) {
        alert('Ya hay canciones almacenadas en este proyecto. Para evitar datos duplicados, no se ha realizado la conversión.')
        return
      }
      const saved = selectedProject.singleTrackInfo
      const versions = currentVersions
      const track = (saved || versions.length > 0) ? {
        id: saved?.id ?? crypto.randomUUID(),
        name: saved?.name ?? selectedProject.name,
        status: saved?.status ?? (versions.some(v => v.status === 'final') ? 'final' : 'demo'),
        versions,
        nextVersionNumber: selectedProject.nextVersionNumber ?? versions.length + 1
      } : null
      updatedProject = {
        ...updatedProject,
        versions: [],
        tracks: track ? [track] : [],
        singleTrackInfo: null
      }
    }

    const labels = { single: 'Sencillo', ep: 'EP', album: 'Álbum', beat: 'Beat' }
    const message = `¿Cambiar «${selectedProject.name}» de ${labels[oldType] ?? oldType} a ${labels[nextType]}?` +
      (wasRelease !== willBeRelease ? '\n\nLas versiones se reorganizarán sin eliminar los archivos ni los comentarios.' : '')
    if (!window.confirm(message)) return

    // Al volver a las canciones del proyecto, evitamos conservar una selección obsoleta.
    releaseAudioRef.current?.pause()
    setReleaseIndex(-1)
    setReleaseQueue([])
    setIsReleasePlaying(false)
    setSelectedTrack(null)
    setSelectedVersion(null)
    setPendingUpload(null)
    setProjects(current => current.map(project =>
      project.id === selectedProject.id ? updatedProject : project
    ))
    setSelectedProject(updatedProject)
  }

  // Seleccionar un audio abre primero el formulario del historial.
  function prepareVersionUpload(event, scope) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPendingUpload({ file, scope })
    setChangeLog('')
    setLinkedCommentIds([])
  }

  function cancelVersionUpload() {
    setPendingUpload(null)
    setChangeLog('')
    setLinkedCommentIds([])
  }

  // El vínculo conserva una copia del comentario, incluso si luego se modifica.
  async function confirmVersionUpload() {
    if (!pendingUpload || savingRevision) return
    const { file, scope } = pendingUpload
    const trackScope = scope === 'track'
    const owner = trackScope ? selectedTrack : selectedProject
    const oldVersions = owner.versions ?? []
    const previousVersion = oldVersions[oldVersions.length - 1]
    const previousComments = previousVersion?.comments ?? []
    const corrections = previousComments.filter((comment) =>
      linkedCommentIds.includes(comment.id) && !comment.resolved
    )
    const versionId = crypto.randomUUID()
    const newVersion = {
      id: versionId,
      number: owner.nextVersionNumber ?? oldVersions.length + 1,
      label: '',
      audio: null,
      comments: [],
      createdAt: new Date().toISOString(),
      status: 'demo',
      changeLog: changeLog.trim(),
      basedOnVersionId: previousVersion?.id ?? null,
      revisionLinks: corrections.map((comment) => ({
        commentId: comment.id,
        text: comment.text,
        timestamp: comment.timestamp,
        sourceVersionId: previousVersion.id,
        sourceVersionNumber: previousVersion.number
      }))
    }
    setSavingRevision(true)
    try {
      await saveAudio(versionId, file)
      const versions = oldVersions.map((version) =>
        version.id === previousVersion?.id
          ? {
              ...version,
              comments: (version.comments ?? []).map((comment) =>
                corrections.some((item) => item.id === comment.id)
                  ? { ...comment, resolved: true, resolvedInVersionId: versionId }
                  : comment
              )
            }
          : version
      )
      const updatedOwner = {
        ...owner,
        versions: [...versions, newVersion],
        nextVersionNumber: newVersion.number + 1
      }
      const updatedProject = trackScope
        ? {
            ...selectedProject,
            tracks: selectedProject.tracks.map((track) =>
              track.id === selectedTrack.id ? updatedOwner : track
            )
          }
        : updatedOwner
      setProjects((current) => current.map((project) =>
        project.id === selectedProject.id ? updatedProject : project
      ))
      setSelectedProject(updatedProject)
      if (trackScope) setSelectedTrack(updatedOwner)
      recordActivity('version', updatedProject, `Nueva versión v${newVersion.number}${trackScope ? ` de ${selectedTrack.name}` : ''}`, trackScope ? selectedTrack.id : null)
      cancelVersionUpload()
    } catch (error) {
      console.error('Error al guardar la nueva versión:', error)
      alert('No se pudo guardar el audio. El formulario sigue abierto para reintentar.')
    } finally {
      setSavingRevision(false)
    }
  }

  function renderRevisionUpload(scope) {
    if (pendingUpload?.scope !== scope) return null
    const owner = scope === 'track' ? selectedTrack : selectedProject
    const previousVersion = owner.versions?.at(-1)
    const pendingComments = (previousVersion?.comments ?? []).filter(
      (comment) => !comment.resolved
    )
    return (
      <section className="revision-upload-panel">
        <h3>Registrar nueva versión</h3>
        <p className="revision-muted">Audio: {pendingUpload.file.name}</p>
        <label htmlFor="revision-change-log">¿Qué cambió en esta versión?</label>
        <textarea
          id="revision-change-log"
          rows={3}
          placeholder="Ej.: Ajusté el volumen de la voz y reduje la saturación del 808..."
          value={changeLog}
          onChange={(event) => setChangeLog(event.target.value)}
        />
        {previousVersion && (
          <div className="revision-corrections">
            <h4>Comentarios pendientes de v{previousVersion.number}</h4>
            {pendingComments.length ? (
              <>
                <p className="revision-muted">Marca solo las correcciones que realizaste. Al guardar, esos comentarios quedarán resueltos en la versión anterior.</p>
                {pendingComments.map((comment) => (
                  <label className="revision-checkbox" key={comment.id}>
                    <input
                      type="checkbox"
                      checked={linkedCommentIds.includes(comment.id)}
                      onChange={(event) => setLinkedCommentIds((current) =>
                        event.target.checked
                          ? [...current, comment.id]
                          : current.filter((id) => id !== comment.id)
                      )}
                    />
                    <span>{formatTime(comment.timestamp)} — {comment.text}</span>
                  </label>
                ))}
              </>
            ) : <p className="revision-muted">No hay comentarios pendientes en la versión anterior.</p>}
          </div>
        )}
        <div className="revision-upload-actions">
          <button type="button" onClick={confirmVersionUpload} disabled={savingRevision}>
            {savingRevision ? 'Guardando…' : 'Guardar versión e historial'}
          </button>
          <button type="button" onClick={cancelVersionUpload} disabled={savingRevision}>
            Cancelar
          </button>
        </div>
      </section>
    )
  }

  function addTrack() {
    if (trackName.trim() === '') {
      return
    }

    const newTrack = {
      id: Date.now(),
      name: trackName.trim(),
      status: 'demo',
      versions: [],
      nextVersionNumber: 1
    }

    const updatedProject = {
      ...selectedProject,
      tracks: [...(selectedProject.tracks ?? []), newTrack]
    }

    setProjects(
      projects.map((project) =>
        project.id === selectedProject.id
          ? updatedProject
          : project
      )
    )

    setSelectedProject(updatedProject)
    setTrackName('')
  }
  

  function startEditingTrack(track) {
    setEditingTrackId(track.id)
    setEditingTrackName(track.name)
  }

  function updateTrackStatus(trackId, newStatus) {
    const updatedProject = {
      ...selectedProject,
      tracks: selectedProject.tracks.map((track) =>
        track.id === trackId
          ? { ...track, status: newStatus }
          : track
      )
    }

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === selectedProject.id
          ? updatedProject
          : project
      )
    )

    setSelectedProject(updatedProject)
    const oldTrack = selectedProject.tracks.find(track => track.id === trackId)
    if (oldTrack && oldTrack.status !== newStatus) {
      const labels = { demo: 'Demo', production: 'En producción', review: 'En revisión', mixing: 'En mezcla', mastering: 'En masterización', final: 'Finalizada' }
      recordActivity('status', updatedProject, `${oldTrack.name}: ${labels[newStatus] ?? newStatus}`, trackId)
    }

    if (selectedTrack?.id === trackId) {
      setSelectedTrack((current) => ({
        ...current,
        status: newStatus
      }))
    }
  }


  function saveTrackName(trackId) {
    const newName = editingTrackName.trim()

    if (newName === '') {
      return
    }

    const updatedProject = {
      ...selectedProject,
      tracks: selectedProject.tracks.map((track) =>
        track.id === trackId
          ? {
              ...track,
              name: newName
            }
          : track
      )
    }

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === selectedProject.id
          ? updatedProject
          : project
      )
    )

    setSelectedProject(updatedProject)

    if (selectedTrack?.id === trackId) {
      setSelectedTrack({
        ...selectedTrack,
        name: newName
      })
    }

    setEditingTrackId(null)
    setEditingTrackName('')
  }

  function moveTrack(trackId, direction) {
    const currentTracks = [...selectedProject.tracks]

    const currentIndex = currentTracks.findIndex(
      (track) => track.id === trackId
    )

    if (currentIndex === -1) {
      return
    }

    const newIndex =
      direction === 'up'
        ? currentIndex - 1
        : currentIndex + 1

    if (newIndex < 0 || newIndex >= currentTracks.length) {
      return
    }

    const [movedTrack] = currentTracks.splice(currentIndex, 1)

    currentTracks.splice(newIndex, 0, movedTrack)

    const updatedProject = {
      ...selectedProject,
      tracks: currentTracks
    }

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === selectedProject.id
          ? updatedProject
          : project
      )
    )

    setSelectedProject(updatedProject)
  }

  async function deleteTrack(trackId) {
    const confirmDelete = window.confirm(
      '¿Seguro que quieres eliminar esta canción? Se eliminarán todas sus versiones, audios y comentarios.'
    )

    if (!confirmDelete) return

    const trackToDelete = selectedProject.tracks.find(
      (track) => track.id === trackId
    )

    if (!trackToDelete) return

    for (const version of trackToDelete.versions ?? []) {
      await deleteAudio(version.id)
    }

    const updatedProject = {
      ...selectedProject,
      tracks: selectedProject.tracks.filter(
        (track) => track.id !== trackId
      )
    }

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === selectedProject.id
          ? updatedProject
          : project
      )
    )

    setSelectedProject(updatedProject)

    if (selectedTrack?.id === trackId) {
      setSelectedTrack(null)
      setSelectedVersion(null)
    }
  }
  
    //Borrar proyecto
  async function deleteProject(projectId) {
    const projectToDelete = projects.find((project) => project.id === projectId)
    if (!projectToDelete) return

    const confirmDelete = window.confirm(
      `¿Eliminar definitivamente "${projectToDelete.name}"?\n\nSe borrarán el proyecto, sus canciones, versiones, audios, comentarios y portada. Esta acción no se puede deshacer.`
    )
    if (!confirmDelete) return

    try {
      const audioIds = new Set([
        ...(projectToDelete.versions ?? []).map((version) => version.id),
        ...(projectToDelete.tracks ?? []).flatMap((track) =>
          (track.versions ?? []).map((version) => version.id)
        )
      ])

      for (const audioId of audioIds) {
        await deleteAudio(audioId)
      }
      await deleteCover(projectId)

      setProjects((currentProjects) =>
        currentProjects.filter((project) => project.id !== projectId)
      )
      setActivity(current => current.filter(item => item.projectId !== projectId))

      if (selectedProject?.id === projectId) {
        setSelectedProject(null)
        setSelectedTrack(null)
        setSelectedVersion(null)
      }
    } catch (error) {
      console.error('No se pudo eliminar el proyecto:', error)
      alert('No se pudo completar la eliminación. Revisa la consola e inténtalo de nuevo.')
    }
  }

  async function openVersion(version) {
    const audioFile = await getAudio(version.id)


    if (audioFile) {
      const audioUrl = URL.createObjectURL(audioFile)

      setSelectedVersion({
        ...version,
        audio: audioUrl
      })
    } else {
      setSelectedVersion({
        ...version,
        audio: null
      })
    }
  }

  function startEditingVersion(version) {
    setEditingVersionId(version.id)
    setVersionLabel(version.label ?? '')
  }

  function saveVersionLabel(versionId) {
    const currentVersions = selectedTrack
      ? selectedTrack.versions
      : selectedProject.versions

    const versionToUpdate = currentVersions.find(
      (version) => version.id === versionId
    )

    if (!versionToUpdate) {
      return
    }

    const updatedVersion = {
      ...versionToUpdate,
      label: versionLabel.trim()
    }

    updateVersionInCurrentContext(updatedVersion)

    setEditingVersionId(null)
    setVersionLabel('')
  }

  function updateVersionStatus(versionId, newStatus) {
    const currentVersions = selectedTrack
      ? selectedTrack.versions
      : selectedProject.versions

    const versionToUpdate = currentVersions.find(
      (version) => version.id === versionId
    )

    if (!versionToUpdate) {
      return
    }

    const updatedVersion = {
      ...versionToUpdate,
      status: newStatus
    }

    updateVersionInCurrentContext(updatedVersion)
    if (versionToUpdate.status !== newStatus) {
      const label = {demo:'Demo', review:'En revisión', approved:'Aprobada', final:'Final'}[newStatus] ?? newStatus
      recordActivity('status', selectedProject, `Versión v${versionToUpdate.number}: ${label}`, selectedTrack?.id ?? null)
    }
  }

  function updateVersionInCurrentContext(updatedVersion) {
    let updatedProject

    if (selectedTrack) {
      const updatedTrack = {
        ...selectedTrack,
        versions: selectedTrack.versions.map((version) =>
          version.id === updatedVersion.id
            ? updatedVersion
            : version
        )
      }

      updatedProject = {
        ...selectedProject,
        tracks: selectedProject.tracks.map((track) =>
          track.id === selectedTrack.id
            ? updatedTrack
            : track
        )
      }

      setSelectedTrack(updatedTrack)
    } else {
      updatedProject = {
        ...selectedProject,
        versions: selectedProject.versions.map((version) =>
          version.id === updatedVersion.id
            ? updatedVersion
            : version
        )
      }
    }

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === selectedProject.id
          ? updatedProject
          : project
      )
    )

    setSelectedProject(updatedProject)
    if (selectedVersion?.id === updatedVersion.id) {
      setSelectedVersion(current => ({ ...updatedVersion, audio: current?.audio ?? null }))
    }
    
  }

  function addComment() {
    if (commentText.trim() === '') {
      return
    }

    const timestamp = wavesurferRef.current
      ? wavesurferRef.current.getCurrentTime()
      : 0

    const newComment = {
      id: Date.now(),
      text: commentText,
      timestamp: timestamp,
      resolved: false
    }

    const updatedVersion = {
      ...selectedVersion,
      comments: [
        ...selectedVersion.comments,
        newComment
      ]
    }

    updateVersionInCurrentContext(updatedVersion)
    recordActivity('comment', selectedProject, `Nuevo comentario en v${selectedVersion.number}: ${commentText.trim().slice(0, 90)}`, selectedTrack?.id ?? null)

    setCommentText('')
  }

    //Borrar comentario
  function toggleCommentResolved(commentId) {
    const updatedVersion = {
      ...selectedVersion,
      comments: (selectedVersion.comments ?? []).map((comment) =>
        comment.id === commentId
          ? { ...comment, resolved: !comment.resolved }
          : comment
      )
    }

    updateVersionInCurrentContext(updatedVersion)
  }

  function deleteComment(commentId) {
    const updatedVersion = {
      ...selectedVersion,

      comments: selectedVersion.comments.filter(
        (comment) => comment.id !== commentId
      )
    }

    updateVersionInCurrentContext(updatedVersion)
  } 

    //Borrar Version
  async function deleteVersion(versionId) {
    const confirmDelete = window.confirm(
      '¿Seguro que quieres eliminar esta versión? Se eliminarán el audio y todos sus comentarios.'
    )

    if (!confirmDelete) return

    await deleteAudio(versionId)

    if (selectedTrack) {
      const updatedTrack = {
        ...selectedTrack,
        versions: selectedTrack.versions.filter(
          (version) => version.id !== versionId
        )
      }

      const updatedProject = {
        ...selectedProject,
        tracks: selectedProject.tracks.map((track) =>
          track.id === selectedTrack.id
            ? updatedTrack
            : track
        )
      }

      setProjects((currentProjects) =>
        currentProjects.map((project) =>
          project.id === selectedProject.id
            ? updatedProject
            : project
        )
      )

      setSelectedProject(updatedProject)
      setSelectedTrack(updatedTrack)
    } else {
      const updatedProject = {
        ...selectedProject,
        versions: selectedProject.versions.filter(
          (version) => version.id !== versionId
        )
      }

      setProjects((currentProjects) =>
        currentProjects.map((project) =>
          project.id === selectedProject.id
            ? updatedProject
            : project
        )
      )

      setSelectedProject(updatedProject)
    }

    if (selectedVersion?.id === versionId) {
      setSelectedVersion(null)
    }
  }




  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }
  
  function goToTimestamp(seconds) {
    if (wavesurferRef.current) {
      wavesurferRef.current.setTime(seconds)
      wavesurferRef.current.play()
    }
  }

  function togglePlay() {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause()

      setIsPlaying(wavesurferRef.current.isPlaying())
    }
  }

  useEffect(() => {
    localStorage.setItem(
      'demolab-projects',
      JSON.stringify(projects)
    )
  }, [projects])


//Use effect de wavesurfer

  useEffect(() => {
    if (!selectedVersion?.audio || !waveformRef.current) {
      return
    }

    const wavesurfer = Wavesurfer.create({
      container: waveformRef.current,
      height: 100,
      waveColor: '#777',
      progressColor: '#7c3aed',
      cursorColor: '#ffffff',
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
//Arrastrar 
      dragToSeek: true,

    })

    wavesurfer.load(selectedVersion.audio)

    wavesurferRef.current = wavesurfer

    wavesurfer.on('ready', () => {
      const audioDuration = wavesurfer.getDuration()

      setCurrentTime(0)
      setIsPlaying(false)
      setDuration(audioDuration)

  })


// Escuchar que está haciendo el boton

    wavesurfer.on('timeupdate', (time) => {
      setCurrentTime(time)
    })

    wavesurfer.on('play', () => {
      setIsPlaying(true)
    })

    wavesurfer.on('pause', () => {
      setIsPlaying(false)
    })

    wavesurfer.on('finish', () => {
      setIsPlaying(false)
    })

    return () => {
      wavesurfer.destroy()
      wavesurferRef.current = null
    }
  }, [selectedVersion?.audio])


  if (selectedVersion) {
    return (
      <main className="version-page">

        <button 
        className="back-button"
        onClick={() => setSelectedVersion(null)}
        >
          ← Volver al proyecto
        </button>

        <div className="review-mode-switch" role="group" aria-label="Modo de visualización">
          <button type="button" className={!reviewMode ? 'selected' : ''} aria-pressed={!reviewMode} onClick={() => setReviewMode(false)}>Vista estudio</button>
          <button type="button" className={reviewMode ? 'selected' : ''} aria-pressed={reviewMode} onClick={() => setReviewMode(true)}>Vista artista</button>
        </div>
        {reviewMode && <p className="review-intro">Escucha la canción, comenta en el segundo que quieras y decide si esta versión está lista.</p>}

        <header className="version-header">
          <p className="project-label">
            {selectedProject.name}
          </p>

          <h1>
            {selectedVersion.number
              ? `v${selectedVersion.number}`
              : selectedVersion.name}
              
            {selectedVersion.label && ` - ${selectedVersion.label}`}
          </h1>
        </header>

        {!reviewMode && (selectedVersion.changeLog || (selectedVersion.revisionLinks ?? []).length > 0) && (
          <section className="revision-history-card">
            <h2>Historial de esta versión</h2>
            {selectedVersion.basedOnVersionId && <p className="revision-muted">Cambios respecto de la versión anterior</p>}
            {selectedVersion.changeLog && <p className="revision-notes">{selectedVersion.changeLog}</p>}
            {(selectedVersion.revisionLinks ?? []).length > 0 && (
              <div>
                <h3>Correcciones registradas ({selectedVersion.revisionLinks.length})</h3>
                <ul>{selectedVersion.revisionLinks.map((item) => (
                  <li key={`${item.sourceVersionId}-${item.commentId}`}>
                    <strong>v{item.sourceVersionNumber} · {formatTime(item.timestamp)}</strong> — {item.text}
                  </li>
                ))}</ul>
              </div>
            )}
          </section>
        )}

        {selectedVersion.audio ? (
          <section className="player-card">
            <div className="waveform-container">

              <div
                ref={waveformRef}
                className="waveform"
              ></div>

              <div className="comment-markers">
                {duration > 0 &&
                  selectedVersion.comments.map((comment, index) => (
                    <button
                      key={comment.id}
                      className={`comment-marker ${comment.resolved ? 'comment-marker-resolved' : ''}`}
                      style={{
                          left: `${(comment.timestamp / duration) * 100}%`
                      }}
                      onClick={() => goToTimestamp(comment.timestamp)}
                    >
                      <span className="marker-number">
                        {index + 1}
                      </span>

                      <div className="comment-tooltip">
                        <span className="tooltip-time">
                          {formatTime(comment.timestamp)}
                        </span>

                        <p>{comment.text}</p>
                        <span className="tooltip-comment-status">
                          {comment.resolved ? 'Resuelto' : 'Pendiente'}
                        </span>
                      </div>
                    </button>
                  ))
                }
                </div>
            </div>
            <div className="player-controls">

              <button
                className="play-button"
                onClick={togglePlay}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>

              <span className="player-time">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
          </section>
        ) : (
          <p>Esta versión todavía no tiene audio.</p>
        )}

        {reviewMode && (
          <section className="artist-decision" aria-label="Decisión sobre esta versión">
            <h2>¿Qué te pareció esta versión?</h2>
            <p>Tu decisión se guarda en el estado de la versión. Puedes cambiarla después.</p>
            <div className="artist-decision-buttons">
              <button type="button" className={selectedVersion.status === 'approved' ? 'active' : ''} aria-pressed={selectedVersion.status === 'approved'} onClick={() => updateVersionStatus(selectedVersion.id, 'approved')}>✓ Me gusta, aprobada</button>
              <button type="button" className={selectedVersion.status === 'review' ? 'active' : ''} aria-pressed={selectedVersion.status === 'review'} onClick={() => updateVersionStatus(selectedVersion.id, 'review')}>✎ Quiero solicitar cambios</button>
            </div>
            <p className="artist-decision-note">{selectedVersion.status === 'approved' ? 'Esta versión está aprobada.' : selectedVersion.status === 'review' ? 'Esta versión está en revisión. Deja tus indicaciones abajo.' : 'Aún no has tomado una decisión sobre esta versión.'}</p>
          </section>
        )}

        <section className="feedback-section">

          <h2>{reviewMode ? 'Tus comentarios' : 'Feedback'}</h2>

          <div className="feedback-overview">
            <span>{selectedVersion.comments?.filter((comment) => !comment.resolved).length ?? 0} pendientes</span>
            <span>{selectedVersion.comments?.filter((comment) => comment.resolved).length ?? 0} resueltos</span>
          </div>

          <div className="comment-form">

            <input
              type="text"
              placeholder={reviewMode ? "Escribe qué cambiarías en este momento..." : "Escribe un comentario..."}
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  addComment()
                }
              }}
            />

            <button onClick={addComment}>
              Publicar
            </button>

          </div>

          <div className="comment-filters" aria-label="Filtrar comentarios">
            {[
              ['all', 'Todos'],
              ['pending', 'Pendientes'],
              ['resolved', 'Resueltos']
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={commentFilter === value ? 'active' : ''}
                aria-pressed={commentFilter === value}
                onClick={() => setCommentFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="comments">

            {(selectedVersion.comments ?? []).length === 0 ? (
              <p className="empty-comments">Todavía no hay comentarios.</p>
            ) : (selectedVersion.comments ?? []).filter((comment) =>
                commentFilter === 'all' ||
                (commentFilter === 'resolved' ? !!comment.resolved : !comment.resolved)
              ).length === 0 ? (
              <p className="empty-comments">No hay comentarios en este filtro.</p>
            ) : (
              (selectedVersion.comments ?? [])
                .filter((comment) =>
                  commentFilter === 'all' ||
                  (commentFilter === 'resolved' ? !!comment.resolved : !comment.resolved)
                )
                .map((comment) => (
                <div className={`comment ${comment.resolved ? 'comment-resolved' : ''}`} key={comment.id}>

                  <button
                    className="comment-time"
                    onClick={() => goToTimestamp(comment.timestamp)}
                    >
                      {formatTime(comment.timestamp)}
                    </button>
                  
                  <p>{comment.text}</p>

                  <button
                    type="button"
                    className={`comment-resolve-button ${comment.resolved ? 'is-resolved' : ''}`}
                    onClick={() => toggleCommentResolved(comment.id)}
                    aria-label={comment.resolved ? 'Marcar comentario como pendiente' : 'Marcar comentario como resuelto'}
                    title={comment.resolved ? 'Volver a pendiente' : 'Marcar como resuelto'}
                  >
                    {comment.resolved ? '✓ Resuelto' : '○ Pendiente'}
                  </button>

                  <button
                    className="delete-comment"
                    onClick={() => deleteComment(comment.id)}
                    title="Eliminar comentario"
                    aria-label="Eliminar comentario"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v5" />
                      <path d="M14 11v5" />
                    </svg>
                  </button>

                </div>
              ))
            )}

          </div>

        </section>

      </main>
    )
  }

  const isRelease =
    selectedProject?.type === 'ep' ||
    selectedProject?.type === 'album'

  if (selectedTrack) {
    return (
      <main className="project-page">

        <button
          className="back-button"
          onClick={() => setSelectedTrack(null)}
        >
          ← Volver al proyecto
        </button>

        <header className="project-header">
          <div>
            <p className="project-label">
              {selectedProject.name}
            </p>

            <h1>{selectedTrack.name}</h1>
          </div>

          <label className="upload-version">
            + Subir nueva versión

            <input 
              type="file"
              accept="audio/*"
              onChange={(event) => prepareVersionUpload(event, 'track')}
              hidden
           />
          </label>
        </header>

        <div className="track-detail-status">
          <label htmlFor="selected-track-status">Estado de la canción</label>
          <select
            id="selected-track-status"
            value={selectedTrack.status ?? 'demo'}
            onChange={(event) =>
              updateTrackStatus(selectedTrack.id, event.target.value)
            }
          >
            <option value="demo">Demo</option>
            <option value="production">En producción</option>
            <option value="review">En revisión</option>
            <option value="mixing">En mezcla</option>
            <option value="mastering">En masterización</option>
            <option value="final">Finalizada</option>
          </select>
        </div>

        {renderRevisionUpload('track')}

        {selectedTrack.versions.length >= 2 && <VersionComparator key={selectedTrack.id} versions={selectedTrack.versions} />}

        <h2>Versiones</h2>

        <div className="versions">
          {selectedTrack.versions.length === 0 ? (
            <div className="empty-versions">
              <p>Esta canción todavía no tiene versiones.</p>
              <p>Sube el primer audio para comenzar.</p>
            </div>
          ) : (
            selectedTrack.versions.map((version) => (
              <div
                className="version-card"
                key={version.id}
              >
                <div className="version-icon">
                  🎵
                </div>

                <div className="version-info">

                  {/* Nombre de la versión */}
                  {editingVersionId === version.id ? (
                    <div className="version-name-edit">

                      <input
                        type="text"
                        value={versionLabel}
                        placeholder="Ej: Pre-master"
                        onChange={(event) => setVersionLabel(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            saveVersionLabel(version.id)
                          }
                        }}
                        autoFocus
                      />

                      <button
                        onClick={() => saveVersionLabel(version.id)}
                      >
                        Guardar
                      </button>

                    </div>
                  ) : (
                    <h3>
                      v{version.number}
                      {version.label && ` - ${version.label}`}
                    </h3>
                  )}

                  {/* Estado de la versión */}
                  <div className="version-status">

                    <span
                      className={`status-badge status-${version.status ?? 'demo'}`}
                    >
                      {version.status === 'review'
                        ? 'En revisión'
                        : version.status === 'approved'
                        ? 'Aprobada'
                        : version.status === 'final'
                        ? 'Final'
                        : 'Demo'}
                    </span>

                    <select
                      value={version.status ?? 'demo'}
                      onChange={(event) =>
                        updateVersionStatus(version.id, event.target.value)
                      }
                    >
                      <option value="demo">Demo</option>
                      <option value="review">En revisión</option>
                      <option value="approved">Aprobada</option>
                      <option value="final">Final</option>
                    </select>

                  </div>

                  {(version.changeLog || (version.revisionLinks ?? []).length > 0) && (
                    <div className="revision-card-summary">
                      {version.changeLog && <p>{version.changeLog}</p>}
                      {(version.revisionLinks ?? []).length > 0 && (
                        <small>✓ {version.revisionLinks.length} correcciones registradas</small>
                      )}
                    </div>
                  )}

                <p className="version-date">
                    {version.createdAt
                      ? new Date(version.createdAt).toLocaleString('es-CL')
                      : 'Fecha no disponible'}
                  </p>

                  <p>
                    {version.comments.length} comentarios
                  </p>
                </div>

                <button
                  className="open-version"
                  onClick={() => openVersion(version)}
                >
                  Abrir
                </button>

                <button
                  className="edit-version"
                  onClick={() => startEditingVersion(version)}
                  title="Renombrar versión"
                  aria-label="Renombrar versión"
                >
                  ✏️
                </button>

                <button
                  className="delete-version"
                  onClick={() => deleteVersion(version.id)}
                  title="Eliminar versión"
                  aria-label="Eliminar versión"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v5" />
                    <path d="M14 11v5" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </main>
    )
  }


  if (selectedProject) {
    return (
      <main className="project-page">
        <audio
          ref={releaseAudioRef}
          onTimeUpdate={(event) =>
            setReleaseCurrentTime(event.currentTarget.currentTime)
          }
          onLoadedMetadata={(event) =>
            setReleaseDuration(event.currentTarget.duration)
          }
          onEnded={nextReleaseTrack}
          onPlay={() => setIsReleasePlaying(true)}
          onPause={() => setIsReleasePlaying(false)}
        />
        <button
         className="back-button"
         onClick={() => setSelectedProject(null)}
        >
          ← Volver
        </button>

        <header className="project-header">

          <div>
            <p className="project-label">
              Proyecto
            </p>

            <h1>{selectedProject.name}</h1>
          </div>

          {!isRelease && (

            <label className="upload-version">
              + Subir nueva versión

              <input
                type="file" 
                accept="audio/*"
                onChange={(event) => prepareVersionUpload(event, 'project')}
                hidden
              />
            </label>
          )}

        </header>

        <section className="project-settings">
          <button
            type="button"
            className="project-settings-toggle"
            aria-expanded={showProjectSettings}
            onClick={() => showProjectSettings ? setShowProjectSettings(false) : openProjectSettings()}
          >
            ⚙ Configuración del proyecto {showProjectSettings ? '▴' : '▾'}
          </button>
          {showProjectSettings && (
            <div className="project-settings-panel">
              <div className="project-settings-field">
                <label htmlFor="settings-project-name">Nombre del proyecto</label>
                <div className="project-settings-name-row">
                  <input
                    id="settings-project-name"
                    type="text"
                    maxLength={150}
                    value={projectNameDraft}
                    onChange={(event) => setProjectNameDraft(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') saveProjectName() }}
                  />
                  <button type="button" onClick={saveProjectName} disabled={!projectNameDraft.trim() || projectNameDraft.trim() === selectedProject.name}>
                    Guardar nombre
                  </button>
                </div>
              </div>
              <div className="project-settings-field">
                <label htmlFor="edit-project-type">Tipo de proyecto</label>
                <select
                  id="edit-project-type"
                  value={selectedProject.type}
                  onChange={(event) => changeProjectType(event.target.value)}
                >
                  <option value="single">Sencillo</option>
                  <option value="ep">EP</option>
                  <option value="album">Álbum</option>
                  <option value="beat">Beat</option>
                </select>
                <p>Si cambias entre sencillo y EP/álbum, conservaremos las versiones y comentarios. Los proyectos con varias canciones no se convertirán en sencillo automáticamente.</p>
              </div>
              <div className="project-settings-field">
                <label>Portada del proyecto</label>
                <label className="cover-upload-button">
                  {projectCover ? 'Cambiar portada' : '+ Añadir portada'}
                  <input type="file" accept="image/*" onChange={handleCoverUpload} hidden />
                </label>
              </div>
            </div>
          )}
        </section>

        <div className="project-cover-section">
          {projectCover ? (
            <img src={projectCover} alt={`Portada de ${selectedProject.name}`} className="project-cover-image" />
          ) : (
            <div className="project-cover-placeholder">🎵</div>
          )}
        </div>

{/* Tarjetas */}

      {isRelease ? (
        <>
          <div className="release-heading">

            <h2>Canciones</h2>

            <button
              className="play-release-button"
              onClick={playRelease}
            >
              ▶ Escuchar {selectedProject.type === 'album'
                ? 'álbum'
                : 'EP'}
            </button>

          </div>
          
          <div className="track-form">
            <input
               type="text"
               placeholder="Nombre de la canción"
               value={trackName}
               onChange={(event) => setTrackName(event.target.value)}
               onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  addTrack()
                }
              }}
            />
            
            <button onClick={addTrack}>
              + Añadir canción
            </button>
          </div>

          <div className="tracks">
            {(selectedProject.tracks ?? []).length === 0 ? (
              <div className="empty-tracks">
                <p>Este proyecto todavía no tiene canciones.</p>
                <p>Añade la primera canción para comenzar.</p>
              </div>
            ) : (
              selectedProject.tracks.map((track, index) => (
                <div
                  className="track-card"
                  key={track.id}
                  onClick={() => setSelectedTrack(track)}
                >
                  <span className="track-number">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <div className="track-info">

                    {editingTrackId === track.id ? (
                      <div className="version-name-edit">

                        <input
                          type="text"
                          value={editingTrackName}
                          onChange={(event) =>
                            setEditingTrackName(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              saveTrackName(track.id)
                            }
                          }}
                          autoFocus
                          onClick={(event) => event.stopPropagation()}
                        />

                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            saveTrackName(track.id)
                          }}
                        >
                          Guardar
                        </button>

                      </div>
                    ) : (
                      <h3>{track.name}</h3>
                    )}

                    <p>
                      {track.versions.length} versiones
                    </p>


                    <div
                      className="track-status"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <select
                        value={track.status ?? 'demo'}
                        onChange={(event) =>
                          updateTrackStatus(track.id, event.target.value)
                        }
                      >
                        <option value="demo">Demo</option>
                        <option value="production">En producción</option>
                        <option value="review">En revisión</option>
                        <option value="mixing">En mezcla</option>
                        <option value="mastering">En masterización</option>
                        <option value="final">Finalizada</option>
                      </select>
                    </div>


                  </div>

                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      moveTrack(track.id, 'up')
                    }}
                    disabled={index === 0}
                    title="Mover canción arriba"
                    aria-label="Mover canción arriba"
                  >
                    ↑
                  </button>

                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      moveTrack(track.id, 'down')
                    }}
                    disabled={index === selectedProject.tracks.length - 1}
                    title="Mover canción abajo"
                    aria-label="Mover canción abajo"
                  >
                    ↓
                  </button>

                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedTrack(track)
                    }}
                  >
                    Abrir
                  </button>

                  <button
                    className="edit-version"
                    onClick={(event) => {
                      event.stopPropagation()
                      startEditingTrack(track)
                    }}
                    title="Renombrar canción"
                    aria-label="Renombrar canción"
                  >
                    ✏️
                  </button>

                  <button
                    className="delete-version"
                    onClick={(event) => {
                      event.stopPropagation()
                      deleteTrack(track.id)
                    }}
                    title="Eliminar canción"
                    aria-label="Eliminar canción"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v5" />
                      <path d="M14 11v5" />
                    </svg>
                  </button>
            </div>
          ))
        )}
      </div>
      {releaseIndex !== -1 && releaseQueue[releaseIndex] && (

        <div className="release-player">

          <div className="release-player-info">

            <span className="release-playing-label">
              REPRODUCIENDO
            </span>

            <strong>
              {releaseQueue[releaseIndex].trackName}
            </strong>

            <span>
              v{releaseQueue[releaseIndex].versionNumber}

              {releaseQueue[releaseIndex].versionLabel &&
                ` · ${releaseQueue[releaseIndex].versionLabel}`
              }
            </span>

          </div>

          <div className="release-player-controls">

            <button
              onClick={previousReleaseTrack}
              disabled={releaseIndex === 0}
            >
              ⏮
            </button>

            <button
              className="release-play-main"
              onClick={toggleReleasePlayback}
            >
              {isReleasePlaying ? '⏸' : '▶'}
            </button>

            <button
              onClick={nextReleaseTrack}
              disabled={
                releaseIndex === releaseQueue.length - 1
              }
            >
              ⏭
            </button>

          </div>

          <div className="release-progress">

            <span>
              {formatTime(releaseCurrentTime)}
            </span>

            <input
              type="range"
              min="0"
              max={releaseDuration || 0}
              value={releaseCurrentTime}
              onChange={handleReleaseSeek}
            />

            <span>
              {formatTime(releaseDuration)}
            </span>

          </div>

        </div>

      )}
    </>
    
  ) : (
    <>
  

        {renderRevisionUpload('project')}

        {selectedProject.singleTrackInfo && (
          <section className="converted-single-info">
            <p className="converted-single-label">Canción conservada del EP o álbum</p>
            <h2>{selectedProject.singleTrackInfo.name}</h2>
            <label htmlFor="converted-single-status">Estado de la canción</label>
            <select
              id="converted-single-status"
              value={selectedProject.singleTrackInfo.status ?? 'demo'}
              onChange={(event) => {
                const updated = {
                  ...selectedProject,
                  singleTrackInfo: {
                    ...selectedProject.singleTrackInfo,
                    status: event.target.value
                  }
                }
                setProjects(current => current.map(project =>
                  project.id === updated.id ? updated : project
                ))
                setSelectedProject(updated)
              }}
            >
              <option value="demo">Demo</option>
              <option value="production">En producción</option>
              <option value="review">En revisión</option>
              <option value="mixing">En mezcla</option>
              <option value="mastering">En masterización</option>
              <option value="final">Finalizada</option>
            </select>
          </section>
        )}

        {selectedProject.versions.length >= 2 && <VersionComparator key={selectedProject.id} versions={selectedProject.versions} />}

        <h2>Versiones</h2>

        <div className="versions">

          {selectedProject.versions.length === 0 ? (
            <div className="empty-versions">
              <p>Este proyecto todavía no tiene versiones.</p>
              <p>Sube tu primer audio para comenzar.</p>
            </div>
           ) : (
              selectedProject.versions.map((version) => (
            <div className="version-card" key={version.id}>

              <div className="version-icon">
                🎵
              </div>

              <div className="version-info">

                {/*Nombre de la versión */}
                  {editingVersionId === version.id ?(
                    <div className="version-name-edit">

                      <input
                         type="text"
                         value={versionLabel}
                         placeholder="Ej: Pre-master"
                         onChange={(event) => setVersionLabel(event.target.value)}
                         onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            saveVersionLabel(version.id)
                          }
                        }}
                        autoFocus 
                      />

                      <button
                        onClick={() => saveVersionLabel(version.id)}
                      >
                        Guardar

                      </button>

                    </div>
                  ) : (
                    <h3>
                      {version.number
                        ? `v${version.number}`
                        : version.name}

                      {version.label && ` - ${version.label}`}
                    </h3>

                  )}

                  <div className="version-status">

                    <span
                      className={`status-badge status-${version.status ?? 'demo'}`}
                      >
                        {version.status === 'review'
                          ? 'En revisión'
                          : version.status === 'approved'
                          ? 'Aprobada'
                          : version.status === 'final'
                          ? 'Final'
                          : 'Demo'}
                      </span>

                      <select
                        value={version.status ?? 'demo'}
                        onChange={(event) =>
                          updateVersionStatus(version.id, event.target.value)
                        }
                      >
                        <option value="demo">Demo</option>
                        <option value="review">En revisión</option>
                        <option value="approved">Aprobada</option>
                        <option value="final">Final</option>
                      </select>

                  </div>

                    {(version.changeLog || (version.revisionLinks ?? []).length > 0) && (
                    <div className="revision-card-summary">
                      {version.changeLog && <p>{version.changeLog}</p>}
                      {(version.revisionLinks ?? []).length > 0 && (
                        <small>✓ {version.revisionLinks.length} correcciones registradas</small>
                      )}
                    </div>
                  )}

                <p className="version-date">
                  {version.createdAt
                    ? new Date(version.createdAt).toLocaleString('es-CL')
                    : 'Fecha no disponible'}
                </p>
                {/*Cantidad de comentarios */}
                <p>
                  {version.comments.length} comentarios
                </p>

              </div>

              <button
                className="open-version"
                onClick={() => openVersion(version)}
              >
                Abrir
              </button>

              <button
                className="edit-version"
                onClick={() => startEditingVersion(version)}
                title="Renombrar versión"
                aria-label="Renombrar versión"
              >
                ✏️
              </button>

              <button
                className="delete-version"
                onClick={() => deleteVersion(version.id)}
                title="Eliminar versión"
                aria-label="Eliminar versión"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v5" />
                  <path d="M14 11v5" />
                </svg>
              </button>

            </div>
          ))
        )}

        </div>
        </>

    )}

      </main>
    )
  }

  function getProjectStats(project) {
    const isRelease =
      project.type === 'ep' ||
      project.type === 'album'

    const tracks = project.tracks ?? []

    const versions = isRelease
      ? tracks.flatMap((track) => track.versions ?? [])
      : project.versions ?? []

    const comments = versions.reduce(
      (total, version) =>
        total + (version.comments?.length ?? 0),
      0
    )

    const finalVersions = versions.filter(
      (version) => version.status === 'final'
    ).length

    let progress = 0
    let completedTracks = 0

    if (isRelease) {

      completedTracks = tracks.filter((track) => track.status === 'final').length

      progress = tracks.length > 0
        ? Math.round(
            (completedTracks / tracks.length) * 100
          )
        : 0
    } else {
      progress = finalVersions > 0 || project.singleTrackInfo?.status === 'final' ? 100 : 0
    }

    return {
      isRelease,
      tracks: tracks.length,
      versions: versions.length,
      comments,
      completedTracks,
      progress
    }
  }

  /*Dashboard Principal */

  const totalProjects = projects.length

  const totalTracks = projects.reduce(
    (total, project) => total + (project.tracks?.length ?? 0),
    0
  )

  const allVersions = projects.flatMap((project) => [
    ...(project.versions ?? []),
    ...(project.tracks ?? []).flatMap(
      (track) => track.versions ?? []
    )
  ])

  const totalVersions = allVersions.length

  // Un proyecto está finalizado cuando su progreso llega al 100%.
  // En EP/álbum esto exige que todas sus canciones estén finalizadas;
  // en sencillos/beats, que al menos una versión esté marcada como final.
  const totalFinalProjects = projects.filter((project) =>
    getProjectStats(project).progress === 100
  ).length

  return (
    <main className="dashboard">

      <header className="header">
        <h1>DemoLab</h1>

        <div className="header-actions">

          <button
            className="backup-button"
            onClick={exportBackup}
          >
            ↓ Exportar
          </button>

          <label>
            ↑ Importar

            <input
              type="file"
              accept=".json,application/json"
              onChange={importBackup}
              hidden
            />
          </label>

          <button
            className="new-project"
            onClick={() => setShowForm(true)}
          >
            + Crear proyecto
          </button>

        </div>
      </header>
      <section className="dashboard-stats">
        <h2>Tu actividad musical</h2>
        <div className="stats-grid">

          <div className="stat-card">
            <span className="stat-icon purple">◈</span>
            <h3>{totalProjects}</h3>
            <p>Proyectos</p>
          </div>

          <div className="stat-card">
            <span className="stat-icon blue">♫</span>
            <h3>{totalTracks}</h3>
            <p>Canciones</p>
          </div>

          <div className="stat-card">
            <span className="stat-icon yellow">▤</span>
            <h3>{totalVersions}</h3>
            <p>Versiones</p>
          </div>

          <div className="stat-card">
            <span className="stat-icon green">✓</span>
            <h3>{totalFinalProjects}</h3>
            <p>Proyectos finalizados</p>
          </div>
        </div>
      </section>
      <section className="activity-section" aria-label="Actividad reciente">
        <div className="activity-heading"><h2>Actividad reciente</h2><span>Últimos movimientos</span></div>
        {activity.filter(entry => projects.some(p => p.id === entry.projectId)).length === 0 ? (
          <p className="activity-empty">Todavía no hay actividad registrada. Las próximas versiones, comentarios y cambios de estado aparecerán aquí.</p>
        ) : (
          <div className="activity-list">
            {activity.filter(entry => projects.some(p => p.id === entry.projectId)).slice(0, 8).map(entry => (
              <button type="button" className="activity-item" key={entry.id} onClick={() => openActivity(entry)}>
                <span className="activity-symbol" aria-hidden="true">{{ version: '♫', comment: '💬', status: '✓', project: '◈' }[entry.type] ?? '•'}</span>
                <span className="activity-content"><strong>{entry.description}</strong><span>{projects.find(p => p.id === entry.projectId)?.name ?? entry.projectName}</span></span>
                <time dateTime={entry.at}>{new Date(entry.at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</time>
              </button>
            ))}
          </div>
        )}
      </section>
      {showForm && (
        <div className="project-form">
          <h2>Crear nuevo proyecto</h2>

          <input 
            type="text"
            placeholder="Nombre del proyecto" 
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                createProject()
              }
            }}
          />

          <div className="project-type-field">
            <label htmlFor="project-type">
              Tipo de proyecto
            </label>

            <select
              id="project-type"
              value={projectType}
              onChange={(event) => setProjectType(event.target.value)}
              >
                <option value="single">Single</option>
                <option value="ep">EP</option>
                <option value="album">Álbum</option>
                <option value="beat">Beat</option>
              </select>
          </div>

          <button onClick={createProject}>
            Crear
          </button>

          <button onClick={() => setShowForm(false)}>
            Cancelar
          </button>
        </div>
      )}
      <section>
        <h2>Tus proyectos</h2>

        <div className="projects">
          {projects.map((project) => {
            const stats = getProjectStats(project)

            return (
            <article
              className="project-card"
              key={project.id}
              onClick={() => setSelectedProject(project)}
            >
              <ProjectCover project={project} />

              <div className="project-info">
                <h3>{project.name}</h3>

                <span className="project-type">
                  {project.type === 'ep'
                    ? 'EP'
                    : project.type === 'album'
                    ? 'Álbum'
                    : project.type === 'beat'
                    ? 'Beat'
                    : 'Single'}
                </span>


                  <div className="project-details">
                    <p>
                      {stats.isRelease
                        ? `${stats.tracks} canciones · ${stats.versions} versiones`
                        : `${stats.versions} versiones`}
                    </p>

                    <p>💬 {stats.comments} comentarios</p>
                  </div>

                  <div className="project-progress">
                    <div className="progress-header">
                      <span>Progreso</span>
                      <span>{stats.progress}%</span>
                    </div>

                    <div
                      className="progress-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={stats.progress}
                    >
                      <div
                        className="progress-fill"
                        style={{ width: `${stats.progress}%` }}
                      />
                    </div>

                    {stats.isRelease && (
                      <p className="progress-detail">
                        {stats.completedTracks} de {stats.tracks} canciones finalizadas
                      </p>
                    )}
                  </div>

              </div>

              <div className="project-card-actions">
                <button
                  type="button"
                  className="delete-project"
                  onClick={(event) => {
                    event.stopPropagation()
                    deleteProject(project.id)
                  }}
                  title={`Eliminar ${project.name}`}
                  aria-label={`Eliminar proyecto ${project.name}`}
                >
                  <span aria-hidden="true">🗑</span>
                  Eliminar proyecto
                </button>
              </div>
            </article>
            )
          })}

        </div>
      </section>

    </main>
  )
}

export default App