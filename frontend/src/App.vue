<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, nextTick, watch } from 'vue'
import { useNoteStore } from './stores/noteStore'
import draggable from 'vuedraggable'

const store = useNoteStore()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const lineNumbersRef = ref<HTMLDivElement | null>(null)
const showDeleteModal = ref(false)
const showClearAllModal = ref(false)
const isMobile = ref(window.matchMedia('(max-width: 768px)').matches)

const password = ref('')
const isLoggingIn = ref(false)
const copyFeedback = ref(false)

const updateMobileStatus = () => {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches
}

onMounted(async () => {
  await store.checkAuth()
  
  const params = new URLSearchParams(window.location.search)
  const noteId = params.get('note')

  if (store.isAuthenticated) {
    await store.fetchNotes()
    // Restore active note from URL
    if (noteId && store.notes.some(n => n.id === noteId)) {
      store.activeNoteId = noteId
    }
  } else if (noteId) {
    // Try to fetch as public note if not authenticated
    await store.fetchPublicNote(noteId)
  }
  
  window.addEventListener('keydown', handleGlobalKeyDown, { capture: true })
  window.addEventListener('resize', updateMobileStatus)
})

// Sync activeNoteId with URL
watch(() => store.activeNoteId, (newId) => {
  const url = new URL(window.location.href)
  if (newId) {
    url.searchParams.set('note', newId)
  } else {
    url.searchParams.delete('note')
  }
  window.history.replaceState({}, '', url.toString())
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true })
  window.removeEventListener('resize', updateMobileStatus)
  window.removeEventListener('mousedown', closeMoreMenu)
})

const handleLogin = async () => {
  if (!password.value) return
  isLoggingIn.value = true
  const success = await store.login(password.value)
  if (success) {
    password.value = ''
  }
  isLoggingIn.value = false
}

const copyLink = async () => {
  try {
    await navigator.clipboard.writeText(window.location.href)
    copyFeedback.value = true
    setTimeout(() => {
      copyFeedback.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy: ', err)
  }
}

const togglePublic = () => {
  if (store.activeNote && store.isAuthenticated) {
    const newValue = store.activeNote.isPublic ? 0 : 1
    store.updateNote(store.activeNote.id, { isPublic: newValue })
  }
}

const togglePublicEditable = () => {
  if (store.activeNote && store.isAuthenticated) {
    const newValue = store.activeNote.isPublicEditable ? 0 : 1
    store.updateNote(store.activeNote.id, { isPublicEditable: newValue })
  }
}

const confirmDelete = async () => {
  if (store.activeNoteId) {
    await store.deleteNote(store.activeNoteId)
    showDeleteModal.value = false
  }
}

const confirmClearAll = async () => {
  await store.deleteAllNotes()
  showClearAllModal.value = false
}

const handleGlobalKeyDown = (e: KeyboardEvent) => {
  const isD = e.code === 'KeyD' || e.key.toLowerCase() === 'd'
  const isX = e.code === 'KeyX' || e.key.toLowerCase() === 'x'
  const isUp = e.code === 'ArrowUp'
  const isDown = e.code === 'ArrowDown'
  const isModifier = (e.metaKey || e.ctrlKey || e.altKey) && e.shiftKey
  const isCmdOrCtrl = e.metaKey || e.ctrlKey
  const isAltShift = e.altKey && e.shiftKey

  if (isModifier && isD) {
    if (document.activeElement === textareaRef.value) {
      e.preventDefault()
      e.stopPropagation()
      duplicateCurrentLine()
    }
  }

  if (isAltShift && (isUp || isDown)) {
    if (document.activeElement === textareaRef.value) {
      e.preventDefault()
      e.stopPropagation()
      moveLine(isUp ? -1 : 1)
    }
  }

  if (isCmdOrCtrl && isX) {
    if (document.activeElement === textareaRef.value) {
      const textarea = textareaRef.value as HTMLTextAreaElement
      if (textarea.selectionStart === textarea.selectionEnd) {
        e.preventDefault()
        e.stopPropagation()
        cutCurrentLine()
      }
    }
  }
}

const cutCurrentLine = async () => {
  const textarea = textareaRef.value
  if (!textarea || !store.activeNoteId || !store.activeNote) return

  const { selectionStart, value } = textarea
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
  let lineEnd = value.indexOf('\n', selectionStart)
  
  let lineToCut = ''
  let newValue = ''
  let newCursorPos = lineStart

  if (lineEnd === -1) {
    // Last line
    lineToCut = value.substring(lineStart)
    newValue = value.substring(0, lineStart)
    // If it's not the only line and has a trailing newline from previous line
    if (lineStart > 0 && newValue.endsWith('\n')) {
        newValue = newValue.slice(0, -1)
        newCursorPos = Math.max(0, lineStart - 1)
    }
  } else {
    // Middle or first line
    lineToCut = value.substring(lineStart, lineEnd + 1) // include \n
    newValue = value.substring(0, lineStart) + value.substring(lineEnd + 1)
    newCursorPos = lineStart
  }

  try {
    // Strip trailing newline for clipboard if we included it
    await navigator.clipboard.writeText(lineToCut.endsWith('\n') ? lineToCut.slice(0, -1) : lineToCut)
    store.updateNote(store.activeNoteId, { content: newValue })
    
    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(newCursorPos, newCursorPos)
      syncScroll()
    })
  } catch (err) {
    console.error('Failed to cut line:', err)
  }
}

const moveLine = (direction: number) => {
  const textarea = textareaRef.value
  if (!textarea || !store.activeNoteId || !store.activeNote) return

  const { selectionStart, value } = textarea
  const lines = value.split('\n')
  
  // Find which line the cursor is on
  let currentPos = 0
  let lineIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue
    const lineEnd = currentPos + line.length
    if (selectionStart >= currentPos && selectionStart <= lineEnd) {
      lineIndex = i
      break
    }
    currentPos = lineEnd + 1 // +1 for \n
  }

  if (lineIndex === -1) return

  const targetIndex = lineIndex + direction
  if (targetIndex < 0 || targetIndex >= lines.length) return

  // Swap lines
  const newLines = [...lines]
  const temp = newLines[lineIndex]
  const targetLine = newLines[targetIndex]
  
  if (temp !== undefined && targetLine !== undefined) {
    newLines[lineIndex] = targetLine
    newLines[targetIndex] = temp
  }

  const newValue = newLines.join('\n')
  store.updateNote(store.activeNoteId, { content: newValue })

  // Calculate new cursor position
  nextTick(() => {
    let newPos = 0
    for (let i = 0; i < targetIndex; i++) {
      const line = newLines[i]
      if (line !== undefined) {
        newPos += line.length + 1
      }
    }
    // Maintain relative offset within the line
    const currentTargetLine = newLines[targetIndex]
    if (currentTargetLine !== undefined) {
      const offsetInLine = selectionStart - currentPos
      const finalPos = newPos + Math.min(offsetInLine, currentTargetLine.length)
      
      textarea.focus()
      textarea.setSelectionRange(finalPos, finalPos)
      syncScroll()
    }
  })
}

const lineNumbers = computed(() => {
  const lines = (store.activeNote?.content || '').split('\n').length
  return Array.from({ length: Math.max(lines, 1) }, (_, i) => i + 1)
})

const syncScroll = () => {
  if (textareaRef.value && lineNumbersRef.value) {
    lineNumbersRef.value.scrollTop = textareaRef.value.scrollTop
  }
}

const handleTitleChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (store.activeNoteId && target) {
    store.updateNote(store.activeNoteId, { title: target.value || '' })
  }
}

const handleContentChange = (e: Event) => {
  const target = e.target as HTMLTextAreaElement
  if (store.activeNoteId && target) {
    store.updateNote(store.activeNoteId, { content: target.value || '' })
  }
  nextTick(syncScroll)
}

const duplicateCurrentLine = () => {
  const textarea = textareaRef.value
  if (!textarea || !store.activeNoteId || !store.activeNote) return

  const { selectionStart, selectionEnd, value } = textarea
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
  let lineEnd = value.indexOf('\n', selectionEnd)
  if (lineEnd === -1) lineEnd = value.length

  const lineContent = value.substring(lineStart, lineEnd)
  const newValue = value.substring(0, lineEnd) + '\n' + lineContent + value.substring(lineEnd)

  store.updateNote(store.activeNoteId, { content: newValue })
  
  nextTick(() => {
    const offset = lineContent.length + 1
    textarea.focus()
    textarea.setSelectionRange(selectionStart + offset, selectionEnd + offset)
    syncScroll()
  })
}

const addNewNote = () => {
  store.createNote('New Note')
}

const onDragEnd = () => {
  store.reorderNotes()
}

// Dummy closeMoreMenu to satisfy onUnmounted for now (from previous task)
const closeMoreMenu = () => {}
</script>

<template>
  <div v-if="store.isAuthenticated === null" class="login-container">
    <p>Loading...</p>
  </div>

  <div v-else-if="!store.isAuthenticated && !store.activeNote" class="login-container">
    <div class="login-card">
      <h1>Online Notes</h1>
      <p>Please enter your password to access your notes.</p>
      <form @submit.prevent="handleLogin">
        <input 
          type="password" 
          v-model="password" 
          placeholder="Password"
          class="password-input"
          autocomplete="off"
          data-1p-ignore
          autofocus
        />
        <button type="submit" :disabled="isLoggingIn" class="btn btn-primary login-btn">
          {{ isLoggingIn ? 'Logging in...' : 'Login' }}
        </button>
        <p v-if="store.error" class="error-text">{{ store.error }}</p>
      </form>
    </div>
  </div>

  <div v-else class="container">
    <div v-if="store.isAuthenticated" class="tabs-wrapper">
      <draggable 
        v-model="store.notes" 
        item-key="id" 
        class="tab-bar"
        :disabled="isMobile"
        @end="onDragEnd"
        animation="200"
      >
        <template #item="{ element: note }">
          <button 
            :class="['tab', { active: store.activeNoteId === note.id }]"
            @click="store.activeNoteId = note.id"
          >
            {{ note.title || 'Untitled' }}
          </button>
        </template>
      </draggable>
      <button @click="addNewNote" class="add-tab" title="Add New Note">+</button>
    </div>

    <main v-if="store.activeNote" class="editor-container">
      <div class="title-row">
        <input 
          type="text" 
          :value="store.activeNote.title" 
          @input="handleTitleChange"
          class="title-input"
          placeholder="Note Title"
          :readonly="!store.isAuthenticated && !store.activeNote.isPublicEditable"
        />
        <div class="title-actions">
          <button 
            v-if="store.isAuthenticated && store.activeNote.isPublic"
            @click="togglePublicEditable" 
            class="public-toggle-btn" 
            :class="{ 'is-editable': store.activeNote.isPublicEditable }"
            :title="store.activeNote.isPublicEditable ? 'Disable Public Edits' : 'Enable Public Edits'"
          >
            {{ store.activeNote.isPublicEditable ? 'Edits Allowed' : 'Read Only' }}
          </button>
          <button 
            v-if="store.isAuthenticated"
            @click="togglePublic" 
            class="public-toggle-btn" 
            :class="{ 'is-public': store.activeNote.isPublic }"
            :title="store.activeNote.isPublic ? 'Make Private' : 'Make Public'"
          >
            {{ store.activeNote.isPublic ? 'Public' : 'Private' }}
          </button>
          <button 
            @click="copyLink" 
            class="copy-link-btn" 
            :title="copyFeedback ? 'Copied!' : 'Copy Link'"
            :class="{ 'copy-success': copyFeedback }"
          >
            <span v-if="!copyFeedback">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            </span>
            <span v-else>Copied!</span>
          </button>
        </div>
      </div>
      
      <div class="editor-wrapper">
        <div class="line-numbers" ref="lineNumbersRef">
          <div v-for="n in lineNumbers" :key="n" class="line-number">{{ n }}</div>
        </div>
        <textarea 
          ref="textareaRef"
          :value="store.activeNote.content" 
          @input="handleContentChange"
          @scroll="syncScroll"
          class="content-area"
          placeholder="Start writing..."
          :readonly="!store.isAuthenticated && !store.activeNote.isPublicEditable"
        ></textarea>
      </div>

      <div class="status-bar">
        <template v-if="store.isAuthenticated">
          <button @click="showDeleteModal = true" class="delete-btn">Delete Note</button>
          <button @click="showClearAllModal = true" class="clear-all-btn">Clear All Notes</button>
          <span style="flex: 1"></span>
          <span>{{ store.isSaving ? 'Saving...' : 'All changes saved' }}</span>
          <button @click="store.logout" class="logout-btn">Logout</button>
        </template>
        <template v-else>
          <span class="public-badge" :class="{ 'editable': store.activeNote.isPublicEditable }">
            {{ store.activeNote.isPublicEditable ? 'Public View (Editable)' : 'Public View (Read-Only)' }}
          </span>
          <span style="flex: 1"></span>
          <span v-if="store.activeNote.isPublicEditable">{{ store.isSaving ? 'Saving...' : 'All changes saved' }}</span>
          <button @click="store.isAuthenticated = false; store.publicNote = null; store.activeNoteId = null" class="logout-btn">Back to Login</button>
        </template>
      </div>
    </main>
    
    <div v-else class="editor-container" style="justify-content: center; align-items: center; color: var(--text-muted);">
      <p>Select a note or create a new one to get started.</p>
      <button @click="showClearAllModal = true" v-if="store.notes.length > 0" class="clear-all-btn" style="margin-top: 1rem;">Clear All Notes</button>
    </div>

    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
        <div class="modal-content">
          <h3>Delete Note</h3>
          <p>Are you sure you want to delete "{{ store.activeNote?.title || 'Untitled' }}"? This action cannot be undone.</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showDeleteModal = false">Cancel</button>
            <button class="btn btn-danger" @click="confirmDelete">Delete</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Clear All Confirmation Modal -->
    <Teleport to="body">
      <div v-if="showClearAllModal" class="modal-overlay" @click.self="showClearAllModal = false">
        <div class="modal-content">
          <h3 style="color: #ef4444;">Clear All Notes</h3>
          <p>Are you sure you want to delete <strong>ALL</strong> {{ store.notes.length }} notes? This action is permanent and cannot be undone.</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showClearAllModal = false">Cancel</button>
            <button class="btn btn-danger" @click="confirmClearAll">Yes, Delete Everything</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
