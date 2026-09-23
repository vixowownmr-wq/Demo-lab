import { useState, useRef, useEffect } from 'react'
import Wavesurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import {
  saveAudio,
  getAudio,
  deleteAudio
} from './audioDB'
import './App.css'

function App() {

  const waveformRef = useRef(null)
  const wavesurferRef = useRef(null)
  const regionsRef = useRef(null)

  const [currentTime, setCurrentTime] = useState(0)

  const [duration, setDuration] = useState(0)

  const [showForm, setShowForm] = useState(false)

  const [projectName, setProjectName] = useState('')

  const [selectedProject, setSelectedProject] = useState(null)

  const [selectedVersion, setSelectedVersion] = useState(null)

  const [commentText, setCommentText] = useState('')

  const [projects, setProjects] = useState(() => {
    const savedProjects = localStorage.getItem('demolab-projects')

    if (savedProjects) {
      return JSON.parse(savedProjects)
    }

    return []
  })


  function createProject() {
    if(projectName.trim() === '') {
      return
    }

    const newProject = {
      id: Date.now(),
      name: projectName,
      comments: 0,
      versions: [],
      nextVersionNumber: 1
    }

    setProjects([...projects, newProject])
    setProjectName('')
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
      name: `Demo v${nextVersionNumber}`,
      audio: audioUrl,
      comments: []
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

    if (regionsRef.current) {
      regionsRef.current.addRegion({
        id: String(newComment.id),
        start: newComment.timestamp,
        end: newComment.timestamp + 0.15,
        color: 'rgba(255, 255, 255, 0.9)',
        drag: false,
        resize: false
      })
    }

    const updatedVersion = {
      ...selectedVersion,
      comments: [...selectedVersion.comments, newComment]
    }

    const updatedProject = {
      ...selectedProject,
      versions: selectedProject.versions.map((version) =>
        version.id === selectedVersion.id
          ? updatedVersion
          : version
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
    setSelectedVersion(updatedVersion)
    setCommentText('')
  }

  function deleteComment(commentId) {
    const updatedVersion = {
      ...selectedVersion,
      comments: selectedVersion.comments.filter(
        (comment) => comment.id !== commentId
      )
    }

    const updatedProject = {
      ...selectedProject,
      versions: selectedProject.versions.map((version) => 
        version.id === selectedVersion.id
          ? updatedVersion
          : version
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
    setSelectedVersion(updatedVersion)
  }


  async function deleteProject(projectId) {
    const confirmDelete = window.confirm(
      '¿Seguro que quieres eliminar este proyecto? Se eliminarán todas sus versiones, audios y comentarios.'
    )

    if (!confirmDelete) return

    const projectToDelete = projects.find(
      (project) => project.id === projectId
    )

    if (projectToDelete) {
      for (const version of projectToDelete.versions) {

        await deleteAudio(version.id)
      }
    }

    setProjects(
      projects.filter((project) => project.id !== projectId)
    )

    if (selectedProject?.id === projectId) {
      setSelectedProject(null)
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

    const regions = RegionsPlugin.create()

    regionsRef.current = regions

    const wavesurfer = Wavesurfer.create({
      container: waveformRef.current,
      height: 100,
      waveColor: '#777',
      progressColor: '#7c3aed',
      cursorColor: '#ffffff',
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      plugins: [regions]
    })

    wavesurfer.load(selectedVersion.audio)

    wavesurferRef.current = wavesurfer

    wavesurfer.on('ready', () => {
      const audioDuration = wavesurfer.getDuration()

      setDuration(audioDuration)

      selectedVersion.comments.forEach((comment) => {
        regions.addRegion({
          id: String(comment.id),
          start: comment.timestamp,
          end: Math.min(
            comment.timestamp + 0.15,
            audioDuration
        ),
        color: 'rgba(255, 255, 255, 0.9)',
        drag: false,
        resize: false
      })
    })
  })

    wavesurfer.on('timeupdate', (time) => {
      setCurrentTime(time)
    })

    return () => {
      wavesurfer.destroy()
      wavesurferRef.current = null
      regionsRef.current = null
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

          <h1>{selectedVersion.name}</h1>
        </header>

        {selectedVersion.audio ? (
          <section className="player-card">
            <div
              ref={waveformRef}
              className="waveform"
            ></div>
            <div className="player-controls">

              <button
                className="play-button"
                onClick={togglePlay}
              >
                ▶
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
              Poyecto
            </p>

            <h1>{selectedProject.name}</h1>
          </div>

          <label className="upload-version">
            + Subir nueva versión

            <input
               type="file"
               accept="audio/*"
               onChange={handleAudioUpload}
               hidden
            />
          </label>

        </header>

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

                <h3>{version.name}</h3>

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
          />

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

                <p>
                  {project.versions.length > 0
                    ? `Última versión: ${project.versions[project.versions.length - 1].name}`
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