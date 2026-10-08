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

  const [selectedTrack, setSelectedTrack] = useState(null)

  const [trackName, setTrackName] = useState('')

  const [editingTrackId, setEditingTrackId] = useState(null)

  const [editingTrackName, setEditingTrackName] = useState('')

  const [selectedVersion, setSelectedVersion] = useState(null)

  const [editingVersionId, setEditingVersionId] = useState(null)

  const [versionLabel, setVersionLabel] = useState('')

  const [commentText, setCommentText] = useState('')



  const [projects, setProjects] = useState(() => {
    const savedProjects = localStorage.getItem('demolab-projects')

    if (savedProjects) {
      return JSON.parse(savedProjects)
    }

    return []
  })

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
    setProjectName('')
    setProjectType('single')
    setShowForm(false)
  }
  async function handleAudioUpload(event) {
    const file = event.target.files[0]

    if (!file) {
      return
    }

    const versionId = Date.now()

    await saveAudio(versionId, file)


    const audioUrl = URL.createObjectURL(file)

    const nextVersionNumber =
      selectedProject.nextVersionNumber ?? 1

    const newVersion = {
      id: versionId,
      number: nextVersionNumber,
      label: '',
      audio: audioUrl,
      comments: [],
      createdAt: new Date().toISOString(),
      status: 'demo'
    }

    const updatedProject = {
      ...selectedProject,
      versions: [...selectedProject.versions, newVersion],
      nextVersionNumber: nextVersionNumber + 1
    }

    setProjects(
      projects.map((project) => 
        project.id === selectedProject.id
          ? updatedProject
          : project
      )
    )

    setSelectedProject(updatedProject)
  }

  async function handleTrackAudioUpload(event) {
    const file = event.target.files[0]

    if (!file) {
      return
    }

    const versionId = Date.now()

    await saveAudio(versionId, file)

    const audioUrl = URL.createObjectURL(file)

    const nextVersionNumber =
      selectedTrack.nextVersionNumber ?? 1

    const newVersion = {
      id: versionId,
      number: nextVersionNumber,
      label: '',
      audio: audioUrl,
      comments: [],
      createdAt: new Date().toISOString(),
      status: 'demo'
    }

    const updatedTrack = {
      ...selectedTrack,
      versions: [...selectedTrack.versions, newVersion],
      nextVersionNumber: nextVersionNumber + 1
    }

    const updatedProject = {
      ...selectedProject,
      tracks: selectedProject.tracks.map((track) =>
        track.id === selectedTrack.id
          ? updatedTrack
          : track
      )
    }

    setProjects(
      projects.map((project) =>
        project.id === selectedProject.id
          ? updatedProject
          : project
      )
    )

    setSelectedProject(updatedProject)
    setSelectedTrack(updatedTrack)
  }

  function addTrack() {
    if (trackName.trim() === '') {
      return
    }

    const newTrack = {
      id: Date.now(),
      name: trackName.trim(),
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
    const confirmDelete = window.confirm(
      '¿Seguro que quieres eliminar este proyecto? Se eliminarán todas sus versiones, canciones, audios y comentarios.'
    )

    if (!confirmDelete) return

    const projectToDelete = projects.find(
      (project) => project.id === projectId
    )

    if (!projectToDelete) return

    // Borrar versiones directas del proyecto
    for (const version of projectToDelete.versions ?? []) {
      await deleteAudio(version.id)
    }

    // Borrar versiones de todas las canciones del EP/Álbum
    for (const track of projectToDelete.tracks ?? []) {
      for (const version of track.versions ?? []) {
        await deleteAudio(version.id)
      }
    }

    setProjects((currentProjects) =>
      currentProjects.filter(
        (project) => project.id !== projectId
      )
    )

    if (selectedProject?.id === projectId) {
      setSelectedProject(null)
      setSelectedTrack(null)
      setSelectedVersion(null)
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
      setSelectedVersion(updatedVersion)
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
      timestamp: timestamp
    }

    const updatedVersion = {
      ...selectedVersion,
      comments: [
        ...selectedVersion.comments,
        newComment
      ]
    }

    updateVersionInCurrentContext(updatedVersion)

    setCommentText('')
  }

    //Borrar comentario
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
                      className="comment-marker"
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

        <section className="feedback-section">

          <h2>Feedback</h2>

          <div className="comment-form">

            <input
              type="text"
              placeholder="Escribe un comentario..."
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

          <div className="comments">

            {selectedVersion.comments.length === 0 ? (
              <p>Todavía no hay comentarios.

              </p>
            ) : (
              selectedVersion.comments.map((comment) => (
                <div className="comment" key={comment.id}>

                  <button
                    className="comment-time"
                    onClick={() => goToTimestamp(comment.timestamp)}
                    >
                      {formatTime(comment.timestamp)}
                    </button>
                  
                  <p>{comment.text}</p>

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
              onChange={handleTrackAudioUpload}
              hidden
           />
          </label>
        </header>



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
                onChange={handleAudioUpload}
                hidden
              />
            </label>
          )}

        </header>

        <div className="project-cover-section">

          {projectCover ? (
            <img
              src={projectCover}
              alt={`Portada de ${selectedProject.name}`}
              className="project-cover-image"
            />
          ) : (
            <div className="project-cover-placeholder">
              🎵
            </div>
          )}

          {selectedProject.type !== 'beat' && (
            <label className="cover-upload-button">
              {projectCover ? 'Cambiar portada' : '+ Añadir portada'}

              <input
                type="file"
                accept="image/*"
                onChange={handleCoverUpload}
                hidden
              />
            </label>
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

  const totalFinalVersions = allVersions.filter(
    (version) => version.status === 'final'
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
            <h3>{totalFinalVersions}</h3>
            <p>Finalizadas</p>
          </div>
        </div>
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
          {projects.map((project) => (
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

                <p>
                  {project.versions.length > 0
                    ? (() => {
                      const latestVersion =
                        project.versions[project.versions.length - 1]

                      const versionName = latestVersion.number
                        ? `v${latestVersion.number}`
                        : latestVersion.name

                      return `Última versión: ${versionName}${
                        latestVersion.label
                          ?` - ${latestVersion.label}`
                          : ''
                      }`
                    })()
                  : 'Sin versiones todavía'
                  }
                </p>

                <span>
                  💬 {project.comments} comentarios
                </span>
              </div>

              <button
                className="delete-project"
                onClick={(event) => {
                  event.stopPropagation()
                  deleteProject(project.id)
                }}
                title="Eliminar proyecto"
                aria-label="Eliminar proyecto"
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
            </article>
          ))}

        </div>
      </section>

    </main>
  )
}

export default App