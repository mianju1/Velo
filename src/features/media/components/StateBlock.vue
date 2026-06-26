<script setup lang="ts">
defineProps<{
  title: string;
  detail?: string;
  loading?: boolean;
}>();
</script>

<template>
  <div class="state-block" role="status">
    <span v-if="loading" class="spinner" aria-hidden="true"></span>
    <strong>{{ title }}</strong>
    <p v-if="detail">{{ detail }}</p>
  </div>
</template>
