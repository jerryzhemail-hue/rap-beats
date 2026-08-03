<template>
  <div class="payment-result">
    <div class="result-card success">
      <div class="icon">✓</div>
      <h2>支付成功！</h2>
      <p>您的会员已开通，享受专属权益吧</p>
      <router-link to="/vip" class="btn">查看会员状态</router-link>
      <router-link to="/" class="btn-secondary">返回首页</router-link>
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

.result-card.success .icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(22, 163, 74, 0.15);
  color: #16a34a;
  font-size: 36px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
  border: 2px solid rgba(22, 163, 74, 0.3);
}

.result-card h2 {
  font-size: 28px;
  font-weight: 700;
  color: #16a34a;
  margin: 0 0 12px;
}

.result-card p {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0 0 32px;
}

.btn {
  display: block;
  padding: 12px 28px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #1a1a2e;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
  text-decoration: none;
  margin-bottom: 12px;
  transition: all 0.2s;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(245, 158, 11, 0.4);
}

.btn-secondary {
  display: block;
  padding: 10px 28px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.2s;
}

.btn-secondary:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
