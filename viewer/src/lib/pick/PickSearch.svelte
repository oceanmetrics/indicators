<script lang="ts">
  // the search box of a picker panel: it takes focus when the panel opens (`data-autofocus`)
  import { Icon } from '../../../../src/icons/index.ts'

  interface Props {
    value: string
    /** the box's accessible name and its placeholder */
    label: string
  }
  let { value = $bindable(), label }: Props = $props()
</script>

<label class="search">
  <Icon name="ui-search" size={16} />
  <span class="mbon-sr-only">{label}</span>
  <input type="search" data-autofocus placeholder={label} bind:value autocomplete="off" />
</label>
