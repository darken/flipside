<script lang="ts" generics="T extends string | number">
  type Option = { value: T; label: string };
  type Props = {
    name: string;
    legend: string;
    options: Option[];
    value: T;
    onchange: (value: T) => void;
  };
  let { name, legend, options, value, onchange }: Props = $props();
</script>

<fieldset class="segmented">
  <legend class="sr-only">{legend}</legend>
  {#each options as option (option.value)}
    <label class:on={value === option.value}>
      <input
        type="radio"
        {name}
        value={option.value}
        checked={value === option.value}
        onchange={() => onchange(option.value)}
      />
      {option.label}
    </label>
  {/each}
</fieldset>

<style>
  .segmented {
    display: flex;
    margin: 0;
    padding: 0;
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--paper-cream) 85%, transparent);
    overflow: hidden;
  }
  label {
    position: relative;
    flex: 1;
    display: grid;
    place-items: center;
    min-height: var(--tap-target);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--accent);
    cursor: pointer;
  }
  label.on {
    background: var(--accent);
    color: var(--paper-cream);
  }
  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
    cursor: pointer;
  }
  label:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: -4px;
  }
</style>
