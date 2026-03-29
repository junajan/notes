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
        </button>
      </template>
    </draggable>
    <button @click="addNewNote" class="add-tab" title="Add New Note">+</button>
  </div>
</template>
