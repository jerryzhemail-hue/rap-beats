<template>
  <div class="payment-result">
    <div class="result-card cancel">
      <div class="icon">✗</div>
      <h2>支付已取消</h2>
      <p>您可以随时返回开通会员</p>
      <router-link to="/vip" class="btn">返回会员页</router-link>
    </div>
  </div>
</template>

<style scoped>
.payment-result {
  min-height: calc(100vh - 64px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
}

.result-card {
  background: var(--bg-card);
  border-radius: 20px;
  padding: 56px 48px;
  text-align: center;
  border: 1px solid var(--border);
  max-width: 420px;
  width: 100%;
}

.result-card.cancel .icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
  font-size: 36px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
  border: 2px solid var(--border);
}

.result-card h2 {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 12px;
}

.result-card p {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0 0 32px;
}

.btn {
  display: inline-block;
  padding: 12px 28px;
  background: var(--accent);
  color: #fff;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
  text-decoration: none;
  transition: all 0.2s;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(124, 58, 237, 0.4);
}
</style>
