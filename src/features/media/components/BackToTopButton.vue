<script setup lang="ts">
defineEmits<{
  backToTop: [];
}>();
</script>

<template>
  <button type="button" class="back-to-top-button" aria-label="回到顶部" @click="$emit('backToTop')">
    <svg data-icon="back-to-top" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5.5 6 11.5M12 5.5l6 6M12 5.5v13"></path>
    </svg>
  </button>
</template>
