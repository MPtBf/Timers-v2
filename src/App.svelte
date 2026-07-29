<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import TimerWidget from "./lib/TimerWidget.svelte";

  let ctrlHeld = $state(false);
  let shiftHeld = $state(false);
  let mouseOver = $state(false);

  function updateClickThrough() {
    if (shiftHeld && mouseOver) {
      invoke("set_opacity", { opacity: 0.0 });
      invoke("set_click_through", { enabled: true });
    } else if (ctrlHeld && mouseOver) {
      invoke("set_opacity", { opacity: 1.0 });
      invoke("set_click_through", { enabled: false });
    } else {
      invoke("set_opacity", { opacity: 0.5 });
      invoke("set_click_through", { enabled: true });
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Control") {
      ctrlHeld = true;
      updateClickThrough();
    }
    if (e.key === "Shift") {
      shiftHeld = true;
      updateClickThrough();
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key === "Control") {
      ctrlHeld = false;
      updateClickThrough();
    }
    if (e.key === "Shift") {
      shiftHeld = false;
      updateClickThrough();
    }
  }

  function onMouseEnter() {
    mouseOver = true;
    updateClickThrough();
  }

  function onMouseLeave() {
    mouseOver = false;
    updateClickThrough();
  }

  $effect(() => {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  $effect(() => {
    invoke("set_click_through", { enabled: true });
    invoke("set_opacity", { opacity: 0.5 });
  });
</script>

<div
  class="app"
  role="application"
  onmouseenter={onMouseEnter}
  onmouseleave={onMouseLeave}
>
  <TimerWidget />
</div>

<style>
  .app {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
  }
</style>
