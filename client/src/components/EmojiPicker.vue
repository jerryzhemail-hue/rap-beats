<script setup lang="ts">
import { ref, computed } from 'vue'

const emit = defineEmits<{ (e: 'select', emoji: string): void }>()

const searchQuery = ref('')

const categories = [
  {
    label: '表情',
    icon: '😀',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
  },
  {
    label: '手势',
    icon: '👍',
    emojis: ['👍','👎','👊','✊','🤛','🤜','🤝','👏','🙌','👐','🤲','🤞','✌️','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐','🖖','👋','🤏','✍️','🙏','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄'],
  },
  {
    label: '物品',
    icon: '🎵',
    emojis: ['🎵','🎶','🎼','🎸','🎹','🥁','🎷','🎺','🎻','🪗','🎤','🎧','📻','🎙','🎚','🎛','🎙️','📯','🎚️','💜','💙','💚','💛','🧡','❤️','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','☸','✡️','🔯','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','⚡','🔱','🚸','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','⚧️','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸','⏯','⏹','⏺','⏮','⏭','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','🔅','🔆','🎚','🎛'],
  },
  {
    label: '符号',
    icon: '❤️',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','🕊','🦅','🦆','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐓','🦃','🦚','🦜','🦤','🪶','🦢','🦩','🕊','🐇','🐰','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔','🪤','🐾','🐉','🐲','🌵','🎄','🌲','🌳','🌴','🪵','🎋','🎍','🪴','🌱','🌿','☘️','🍀','🎍','🎋','🪨','⛰️','🏔️','🗻','🌋','🏗️','🧱','🪜','🛖','🏘️','🏚️','🏗️','🏭','🏢','🏬','🏣','🏤','🏥','🏦','🏨','🏪','🏫','🏩','💒','🏛️','⛪','🕌','🕍','🛕','🕋','⛩️','⛩️','🛤️','🛣️','🗾','🎑','🏞️','🌅','🌄','🌠','🎇','🎆','🌌','🌉','🌁'],
  },
  {
    label: '活动',
    icon: '🎉',
    emojis: ['🎉','🎊','🎈','🎁','🏆','🥇','🥈','🥉','🏅','🎖️','🎗️','🏵️','🎫','🎟️','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🕹️','🎰','🧩','🪅','🪆','🪄','🎴','🀄','🃏','🀄','🎦','📽️','🎬','📺','📻','🎙','🎚','🎛','🧭','⏱','⏲','⏰','🕰','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵','💴','💶','💷','💰','💳','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🧿','🪬','🧧','🎗️','🎫','🎟️','🎪'],
  },
]

const filteredCategories = computed(() => {
  if (!searchQuery.value.trim()) return categories
  const q = searchQuery.value.trim().toLowerCase()
  return categories
    .map(cat => ({
      ...cat,
      emojis: cat.emojis.filter(e => e.includes(q) || cat.label.includes(q))
    }))
    .filter(cat => cat.emojis.length > 0)
})

function selectEmoji(emoji: string) {
  emit('select', emoji)
}
</script>

<template>
  <div class="emoji-picker" @click.stop>
    <div class="emoji-search">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索表情..."
        class="emoji-search-input"
      />
    </div>

    <div class="emoji-body">
      <div v-for="cat in filteredCategories" :key="cat.label" class="emoji-category">
        <div class="emoji-cat-label">{{ cat.icon }} {{ cat.label }}</div>
        <div class="emoji-grid">
          <button
            v-for="emoji in cat.emojis"
            :key="emoji"
            class="emoji-btn"
            type="button"
            :title="emoji"
            @click="selectEmoji(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </div>

      <div v-if="filteredCategories.length === 0" class="emoji-empty">
        没有找到表情
      </div>
    </div>
  </div>
</template>

<style scoped>
.emoji-picker {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  width: 320px;
  max-height: 360px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  z-index: 1000;
  overflow: hidden;
}

.emoji-search {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.emoji-search-input {
  width: 100%;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  box-sizing: border-box;
}

.emoji-search-input:focus {
  border-color: var(--accent);
}

.emoji-search-input::placeholder {
  color: var(--text-secondary);
}

.emoji-body {
  overflow-y: auto;
  flex: 1;
  padding: 4px 8px 8px;
}

.emoji-category {
  margin-bottom: 10px;
}

.emoji-cat-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 4px 4px 2px;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
}

.emoji-btn {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  transition: background 0.1s, transform 0.1s;
  padding: 0;
}

.emoji-btn:hover {
  background: var(--bg-secondary);
  transform: scale(1.15);
}

.emoji-empty {
  text-align: center;
  padding: 20px;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
