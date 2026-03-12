<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, nextTick } from 'vue'
import { useNoteStore } from './stores/noteStore'
import draggable from 'vuedraggable'

const store = useNoteStore()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const lineNumbersRef = ref<HTMLDivElement | null>(null)
const showDeleteModal = ref(false)
const isMobile = ref(window.matchMedia('(max-width: 768px)').matches)

const password = ref('')
const isLoggingIn = ref(false)

const updateMobileStatus = () => {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches
}

onMounted(async () => {
  await store.checkAuth()
  if (store.isAuthenticated) {
    store.fetchNotes()
  }
  window.addEventListener('keydown', handleGlobalKeyDown, { capture: true })
  window.addEventListener('resize', updateMobileStatus)
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

const confirmDelete = async () => {
  if (store.activeNoteId) {
    await store.deleteNote(store.activeNoteId)
    showDeleteModal.value = false
  }
}

const handleGlobalKeyDown = (e: KeyboardEvent) => {
  const isD = e.code === 'KeyD' || e.key.toLowerCase() === 'd'
  const isModifier = (e.metaKey || e.ctrlKey || e.altKey) && e.shiftKey

  if (isModifier && isD) {
    if (document.activeElement === textareaRef.value) {
      console.log('Duplicate shortcut detected:', e.key)
      e.preventDefault()
      e.stopPropagation()
      duplicateCurrentLine()
    }
  }
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
  if (store.activeNoteId) {
    store.updateNote(store.activeNoteId, { title: target.value })
  }
}

const handleContentChange = (e: Event) => {
  const target = e.target as HTMLTextAreaElement
  if (store.activeNoteId) {
    store.updateNote(store.activeNoteId, { content: target.value })
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

  <div v-else-if="!store.isAuthenticated" class="login-container">
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
    <div class="tabs-wrapper">
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
      <input 
        type="text" 
        :value="store.activeNote.title" 
        @input="handleTitleChange"
        class="title-input"
        placeholder="Note Title"
      />
      
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
        ></textarea>
      </div>

      <div class="status-bar">
        <button @click="showDeleteModal = true" class="delete-btn">Delete Note</button>
        <span style="flex: 1"></span>
        <span>{{ store.isSaving ? 'Saving...' : 'All changes saved' }}</span>
        <button @click="store.logout" class="logout-btn">Logout</button>
      </div>
    </main>
    
    <div v-else class="editor-container" style="justify-content: center; align-items: center; color: var(--text-muted);">
      <p>Select a note or create a new one to get started.</p>
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
  </div>
</template>
