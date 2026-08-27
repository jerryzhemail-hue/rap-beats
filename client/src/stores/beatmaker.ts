import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  fetchMyBeatmakerApplication,
  submitBeatmakerApplication,
  fetchBeatmakerList,
  type BeatmakerApplication,
  type BeatmakerListItem,
} from '@/api/beatmaker';

export const useBeatmakerStore = defineStore('beatmaker', () => {
  const myApplication = ref<BeatmakerApplication | null>(null);
  const list = ref<BeatmakerListItem[]>([]);
  const loaded = ref(false);

  async function loadMyApplication(force = false) {
    if (!force && myApplication.value !== null) return;
    try {
      const data = await fetchMyBeatmakerApplication();
      myApplication.value = data.application;
    } catch {
      myApplication.value = null;
    }
  }

  async function apply(payload: {
    real_name: string;
    id_card_no: string;
    portfolio_url: string;
    sample_work_url: string;
    bio: string;
  }) {
    const data = await submitBeatmakerApplication(payload);
    await loadMyApplication(true);
    return data;
  }

  async function loadList(force = false) {
    if (!force && loaded.value) return;
    const data = await fetchBeatmakerList();
    list.value = data.beatmakers;
    loaded.value = true;
  }

  function resetList() {
    list.value = [];
    loaded.value = false;
  }

  return {
    myApplication,
    list,
    loaded,
    loadMyApplication,
    apply,
    loadList,
    resetList,
  };
});