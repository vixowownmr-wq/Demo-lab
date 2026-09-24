import { useState, useRef, useEffect } from 'react'
import Wavesurfer from 'wavesurfer.js'
import {
  saveAudio,
  getAudio,
  deleteAudio,
  getAllAudioKeys
} from './audioDB'
import './App.css'

function App() {

  const waveformRef = useRef(null)
  const wavesurferRef = useRef(null)

  const [currentTime, setCurrentTime] = useState(0)

  const [duration, setDuration] = useState(0)

//estado para saber si está reproduciendo
  const [isPlaying, setIsPlaying] = useState(0)

  const [showForm, setShowForm] = useState(false)

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
        
      {/* Tarjetas */}

      {isRelease ? (
        <>
          <h2>Canciones</h2>
          
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
  return (
    <main className="dashboard">

      <header className="header">
        <h1>DemoLab</h1>

        <button
           className="new-project"
           onClick={() => setShowForm(true)}
        >
            + Crear proyecto
        </button>
      </header>
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
              <div className="project-cover">
                🎵
              </div>

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