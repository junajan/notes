import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import type { Note, CreateNoteInput, UpdateNoteInput } from '@notes/shared'

// Configure axios for credentials (cookies) and CSRF protection
axios.defaults.withCredentials = true
axios.defaults.headers.common['X-Notes-Requested-With'] = 'XMLHttpRequest'

export const useNoteStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const activeNoteId = ref<string | null>(null)
  const publicNote = ref<Note | null>(null) // For unauthenticated public view
  const isSaving = ref(false)
  const error = ref<string | null>(null)
  const isAuthenticated = ref<boolean | null>(null) // null means unknown (checking)
  const theme = ref(localStorage.getItem('theme') || 'light')

  // Apply theme on initial load
  document.body.className = theme.value === 'light' ? '' : `${theme.value}-theme`

  function toggleTheme() {
    const themes = ['light', 'dark', 'pink', 'orange', 'banana', 'sea', 'colorful']
    const currentIndex = themes.indexOf(theme.value)
    const nextIndex = (currentIndex + 1) % themes.length
    theme.value = themes[nextIndex] || 'light'
    
    document.body.className = theme.value === 'light' ? '' : `${theme.value}-theme`
    localStorage.setItem('theme', theme.value)
  }

  const activeNote = computed(() => 
    notes.value.find(n => n.id === activeNoteId.value) || publicNote.value || null
  )

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

  async function updatePublicNote(id: string, updates: UpdateNoteInput) {
    // Immediate local update
    if (publicNote.value && publicNote.value.id === id) {
      publicNote.value = { ...publicNote.value, ...updates } as Note
    }

    if (debounceTimer) clearTimeout(debounceTimer)
    
    isSaving.value = true
    debounceTimer = setTimeout(async () => {
      try {
        await axios.patch(`/api/public/notes/${id}`, updates)
        isSaving.value = false
      } catch (err) {
        error.value = 'Failed to save changes to public note'
        isSaving.value = false
      }
    }, 500)
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

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function updateNote(id: string, updates: UpdateNoteInput) {
    if (!isAuthenticated.value) {
      return updatePublicNote(id, updates)
    }

    // Immediate local update
    const index = notes.value.findIndex(n => n.id === id)
    if (index !== -1) {
      notes.value[index] = { ...notes.value[index], ...updates } as Note
    }

    if (debounceTimer) clearTimeout(debounceTimer)
    
    isSaving.value = true
    debounceTimer = setTimeout(async () => {
      try {
        await axios.patch(`/api/notes/${id}`, updates)
        isSaving.value = false
      } catch (err) {
        error.value = 'Failed to save changes'
        isSaving.value = false
      }
    }, 500)
  }

  async function deleteNote(id: string) {
    try {
      await axios.delete(`/api/notes/${id}`)
      notes.value = notes.value.filter(n => n.id !== id)
      if (activeNoteId.value === id) {
        activeNoteId.value = notes.value.length > 0 ? notes.value[0]?.id || null : null
      }
    } catch (err) {
      error.value = 'Failed to delete note'
    }
  }

  async function deleteAllNotes() {
    try {
      await axios.delete('/api/notes/clear')
      notes.value = []
      activeNoteId.value = null
    } catch (err) {
      error.value = 'Failed to delete all notes'
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
    deleteAllNotes,
    reorderNotes
  }
})
