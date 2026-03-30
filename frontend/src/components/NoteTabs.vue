<script setup lang="ts">
import { useNoteStore } from '../stores/noteStore'
import draggable from 'vuedraggable'

defineProps<{
  isMobile: boolean
}>()

const store = useNoteStore()

const addNewNote = () => {
  store.createNote('New Note')
}

const onDragEnd = () => {
  store.reorderNotes()
}
</script>

<template>
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
          <svg v-if="note.isPublic" class="public-indicator" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
        </button>
      </template>
    </draggable>
    <button @click="addNewNote" class="add-tab" title="Add New Note">+</button>
  </div>
</template>
