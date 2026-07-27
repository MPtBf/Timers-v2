<script lang="ts">
  let { onclick }: { onclick?: () => void } = $props();
</script>

<button class="btn" title="Reset" {onclick}>
  ⏹
</button>

<style>
  .btn {
    width: 48px;
    height: 48px;
    border: none;
    border-radius: 50%;
    background: #2a2a2a;
    color: #e0e0e0;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease;
  }
  .btn:hover {
    background: #333333;
  }
  .btn:active {
    transform: scale(0.95);
  }
</style>
