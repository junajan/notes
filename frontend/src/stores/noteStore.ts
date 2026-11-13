import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import axios from 'axios'
import type { Note, CreateNoteInput, UpdateNoteInput, UpdateNoteRequest } from '@notes/shared'

// Configure axios for credentials (cookies) and CSRF protection
axios.defaults.withCredentials = true
axios.defaults.headers.common['X-Notes-Requested-With'] = 'XMLHttpRequest'

const SAVE_DEBOUNCE_MS = 500
const REMOTE_UPDATE_NOTICE_MS = 4000
// Edits to these fields are version-checked by the server (see applyNoteUpdate in server.ts)
const VERSIONED_FIELDS = ['title', 'content', 'slug'] as const

export const useNoteStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const activeNoteId = ref<string | null>(null)
  const publicNote = ref<Note | null>(null) // For unauthenticated public view
  const error = ref<string | null>(null)
  const isAuthenticated = ref<boolean | null>(null) // null means unknown (checking)
  const theme = ref(localStorage.getItem('theme') || 'light')

  // --- Sync state -------------------------------------------------------------------------
  // Notes with unsent or in-flight edits. Background refresh never touches these.
  const busyNotes = ref(new Set<string>())
  // Note id -> latest server version, set when a save was rejected because the note was
  // changed in another window. Edits are held locally until the user picks a version.
  const conflicts = ref<Record<string, Note>>({})
  // Notes silently refreshed from another window that the user hasn't looked at yet.
  const changedElsewhere = ref<Record<string, true>>({})
  // Id of the active note when it was just refreshed from another window (brief notice).
  const remoteUpdateNotice = ref<string | null>(null)

  const isSaving = computed(() => busyNotes.value.size > 0)

  // Per-note save machinery (not reactive: internal bookkeeping only)
  const pending = new Map<string, UpdateNoteInput>() // edits not yet sent, merged per note
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const saveChains = new Map<string, Promise<void>>() // serializes saves of the same note
  const editSeq = new Map<string, number>() // bumped on every local edit, guards stale refreshes
  let noticeTimer: ReturnType<typeof setTimeout> | null = null
  let isRefreshing = false

  // Apply theme on initial load
  document.body.className = theme.value === 'light' ? '' : `${theme.value}-theme`

  function toggleTheme() {
    const themes = [
      'light', 'dark', 'pink', 'orange', 'banana', 'sea', 'colorful',
      'forest', 'desert', 'nordic', 'deep-space', 'sepia', 'hacker',
      'cyberpunk', 'crt', 'espresso', 'matcha', 'grape', 'slate',
      'dracula', 'paper', 'unicorn', 'batman'
    ]
    const currentIndex = themes.indexOf(theme.value)
    const nextIndex = (currentIndex + 1) % themes.length
    theme.value = themes[nextIndex] || 'light'

    document.body.className = theme.value === 'light' ? '' : `${theme.value}-theme`
    localStorage.setItem('theme', theme.value)
  }

  const activeNote = computed(() =>
    notes.value.find(n => n.id === activeNoteId.value) || publicNote.value || null
  )

  // Opening a note counts as having seen its remote changes
  watch(activeNoteId, (id) => {
    if (id) delete changedElsewhere.value[id]
  })

  function findLocal(id: string): Note | undefined {
    return notes.value.find(n => n.id === id) ?? (publicNote.value?.id === id ? publicNote.value : undefined)
  }

  function setLocal(id: string, note: Note) {
    const index = notes.value.findIndex(n => n.id === id)
    if (index !== -1) notes.value[index] = note
    if (publicNote.value?.id === id) publicNote.value = note
  }

  function isBusy(id: string) {
    return busyNotes.value.has(id) || id in conflicts.value
  }

  function forgetNote(id: string) {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
    pending.delete(id)
    editSeq.delete(id)
    busyNotes.value.delete(id)
    delete conflicts.value[id]
    delete changedElsewhere.value[id]
  }

  function resetSyncState() {
    for (const id of [...pending.keys(), ...timers.keys()]) forgetNote(id)
    busyNotes.value.clear()
    conflicts.value = {}
    changedElsewhere.value = {}
    remoteUpdateNotice.value = null
  }

  async function checkAuth() {
    try {
      const response = await axios.get<{ authenticated: boolean }>('/api/auth/check')
      isAuthenticated.value = response.data.authenticated
      return response.data.authenticated
    } catch (err) {
      isAuthenticated.value = false
      return false
    }
  }

  async function fetchPublicNote(id: string) {
    try {
      const response = await axios.get<Note>(`/api/public/notes/${id}`)
      publicNote.value = response.data
      activeNoteId.value = response.data.id
    } catch (err: any) {
      error.value = 'Public note not found or inaccessible'
    }
  }

  async function fetchNoteBySlug(slug: string) {
    try {
      const response = await axios.get<Note>(`/api/public/notes/slug/${slug}`)
      publicNote.value = response.data
      activeNoteId.value = response.data.id
      return response.data
    } catch (err: any) {
      error.value = 'Note with this slug not found'
      return null
    }
  }

  async function login(password: string) {
    try {
      await axios.post('/api/login', { password })
      isAuthenticated.value = true
      error.value = null
      await fetchNotes()
      return true
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Login failed'
      return false
    }
  }

  async function logout() {
    try {
      await axios.post('/api/logout')
      isAuthenticated.value = false
      notes.value = []
      activeNoteId.value = null
      publicNote.value = null
      resetSyncState()
    } catch (err) {
      console.error('Logout failed')
    }
  }

  async function fetchNotes() {
    try {
      const response = await axios.get<Note[]>('/api/notes')
      notes.value = response.data
      if (notes.value.length > 0 && !activeNoteId.value) {
        activeNoteId.value = notes.value[0]?.id || null
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        isAuthenticated.value = false
      } else {
        error.value = 'Failed to fetch notes'
      }
    }
  }

  async function createNote(title: string) {
    try {
      const input: CreateNoteInput = {
        title,
        content: '',
        positionIndex: notes.value.length,
        slug: null,
        isPublic: 0,
        isPublicEditable: 0
      }
      const response = await axios.post<Note>('/api/notes', input)
      notes.value.push(response.data)
      activeNoteId.value = response.data.id
    } catch (err) {
      error.value = 'Failed to create note'
    }
  }

  /**
   * Applies an edit locally right away and schedules a debounced save.
   * Edits are merged per note, so quickly changing the title and then the content
   * saves both (previously only the last change within the debounce window was sent).
   */
  function updateNote(id: string, updates: UpdateNoteInput) {
    const local = findLocal(id)
    if (!local) return

    setLocal(id, { ...local, ...updates } as Note)
    pending.set(id, { ...pending.get(id), ...updates })
    editSeq.set(id, (editSeq.get(id) ?? 0) + 1)
    busyNotes.value.add(id)

    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.set(id, setTimeout(() => flush(id), SAVE_DEBOUNCE_MS))
  }

  function flush(id: string) {
    timers.delete(id)
    // Chain saves of the same note so each one is based on the version the previous returned
    const chain = (saveChains.get(id) ?? Promise.resolve()).then(() => send(id))
    saveChains.set(id, chain)
    chain.finally(() => {
      if (saveChains.get(id) !== chain) return
      saveChains.delete(id)
      if (!pending.has(id) && !timers.has(id)) busyNotes.value.delete(id)
    })
  }

  async function send(id: string) {
    if (id in conflicts.value) return // hold edits until the user resolves the conflict
    const updates = pending.get(id)
    const local = findLocal(id)
    if (!updates || !local) return
    pending.delete(id)

    const versioned = VERSIONED_FIELDS.some(field => field in updates)
    const body: UpdateNoteRequest = versioned ? { ...updates, baseUpdatedAt: local.updatedAt } : updates
    const url = isAuthenticated.value ? `/api/notes/${id}` : `/api/public/notes/${id}`

    try {
      const { data } = await axios.patch<Note>(url, body)
      // Only a versioned edit moves our base version forward. Adopting the server's
      // updatedAt after a metadata-only save could silently skip past someone else's edit.
      const current = findLocal(id)
      if (versioned && current) setLocal(id, { ...current, updatedAt: data.updatedAt })
      error.value = null
    } catch (err: any) {
      // Put the unsent edits back (newer edits made meanwhile win) so nothing is lost
      pending.set(id, { ...updates, ...pending.get(id) })
      const status = err.response?.status
      if (status === 409 && err.response.data?.note) {
        conflicts.value[id] = err.response.data.note
      } else if (status === 404) {
        pending.delete(id)
        error.value = 'This note no longer exists, it may have been deleted in another window'
      } else {
        error.value = 'Failed to save changes'
      }
    }
  }

  /** Conflict resolution: discard local edits and show the version from the other window. */
  function loadLatest(id: string) {
    const remote = conflicts.value[id]
    const local = findLocal(id)
    if (!remote || !local) return
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
    pending.delete(id)
    delete conflicts.value[id]
    setLocal(id, { ...remote, positionIndex: local.positionIndex })
    if (!saveChains.has(id)) busyNotes.value.delete(id)
  }

  /** Conflict resolution: deliberately overwrite the other window's version with ours. */
  function keepMine(id: string) {
    const remote = conflicts.value[id]
    const local = findLocal(id)
    if (!remote || !local) return
    delete conflicts.value[id]
    setLocal(id, { ...local, updatedAt: remote.updatedAt })
    const ours: UpdateNoteInput = isAuthenticated.value
      ? { title: local.title, content: local.content, slug: local.slug }
      : { title: local.title, content: local.content }
    pending.set(id, { ...pending.get(id), ...ours })
    busyNotes.value.add(id)
    flush(id)
  }

  /**
   * Pulls the latest notes from the server (called on window focus and periodically) so a
   * window doesn't keep editing a stale copy. Notes with unsaved local edits are left alone;
   * if they were changed elsewhere, the server's 409 on the next save surfaces the conflict.
   */
  async function refreshFromServer() {
    if (isRefreshing) return
    isRefreshing = true
    const seqAtStart = new Map(editSeq)
    const idsAtStart = new Set(notes.value.map(n => n.id))
    try {
      if (isAuthenticated.value) {
        const { data } = await axios.get<Note[]>('/api/notes')
        mergeRemoteNotes(data, seqAtStart, idsAtStart)
      } else if (publicNote.value) {
        const { data } = await axios.get<Note>(`/api/public/notes/${publicNote.value.id}`)
        mergeRemoteNote(data, seqAtStart)
      }
    } catch {
      // Background refresh: ignore failures, the next one will retry
    } finally {
      isRefreshing = false
    }
  }

  function mergeRemoteNote(remote: Note, seqAtStart: Map<string, number>) {
    const local = findLocal(remote.id)
    if (!local || isBusy(remote.id)) return
    // Edited (and possibly saved) while the request was in flight: the response may be stale
    if ((editSeq.get(remote.id) ?? 0) !== (seqAtStart.get(remote.id) ?? 0)) return
    if (remote.updatedAt < local.updatedAt) return

    const textChanged = remote.updatedAt !== local.updatedAt
    const metaChanged = remote.isPublic !== local.isPublic || remote.isPublicEditable !== local.isPublicEditable
    if (!textChanged && !metaChanged) return

    setLocal(remote.id, { ...remote, positionIndex: local.positionIndex })
    if (!textChanged) return

    if (remote.id === activeNoteId.value) {
      remoteUpdateNotice.value = remote.id
      if (noticeTimer) clearTimeout(noticeTimer)
      noticeTimer = setTimeout(() => { remoteUpdateNotice.value = null }, REMOTE_UPDATE_NOTICE_MS)
    } else {
      changedElsewhere.value[remote.id] = true
    }
  }

  function mergeRemoteNotes(remoteNotes: Note[], seqAtStart: Map<string, number>, idsAtStart: Set<string>) {
    const remoteIds = new Set(remoteNotes.map(n => n.id))

    for (const remote of remoteNotes) {
      if (findLocal(remote.id)) {
        mergeRemoteNote(remote, seqAtStart)
      } else {
        notes.value.push(remote) // created in another window
        changedElsewhere.value[remote.id] = true
      }
    }

    // Drop notes deleted in another window, unless we hold unsaved edits for them
    // or they were created here after the refresh started
    const deleted = notes.value.filter(n => idsAtStart.has(n.id) && !remoteIds.has(n.id) && !isBusy(n.id))
    if (deleted.length === 0) return
    for (const note of deleted) forgetNote(note.id)
    notes.value = notes.value.filter(n => !deleted.includes(n))
    if (activeNoteId.value && !findLocal(activeNoteId.value)) {
      activeNoteId.value = notes.value[0]?.id ?? null
    }
  }

  async function deleteNote(id: string) {
    try {
      await axios.delete(`/api/notes/${id}`)
      forgetNote(id)
      notes.value = notes.value.filter(n => n.id !== id)
      if (activeNoteId.value === id) {
        activeNoteId.value = notes.value.length > 0 ? notes.value[0]?.id || null : null
      }
    } catch (err) {
      error.value = 'Failed to delete note'
    }
  }

  async function reorderNotes() {
    try {
      const orders = notes.value.map((note, index) => ({
        id: note.id,
        positionIndex: index
      }))
      await axios.patch('/api/notes/reorder', { orders })
    } catch (err) {
      error.value = 'Failed to save new order'
    }
  }

  return {
    notes,
    activeNoteId,
    activeNote,
    isSaving,
    error,
    isAuthenticated,
    theme,
    publicNote,
    conflicts,
    changedElsewhere,
    remoteUpdateNotice,
    checkAuth,
    fetchPublicNote,
    fetchNoteBySlug,
    login,
    logout,
    toggleTheme,
    fetchNotes,
    createNote,
    updateNote,
    deleteNote,
    reorderNotes,
    loadLatest,
    keepMine,
    refreshFromServer
  }
})
