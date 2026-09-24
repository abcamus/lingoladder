interface PlacementModalProps {
  onStart: () => void
  onSkip: () => void
}

export function PlacementModal({ onStart, onSkip }: PlacementModalProps) {
  return (
    <div className="modal-overlay" onClick={onSkip}>
      <div className="modal" onClick={(e) => { e.stopPropagation() }}>
        <div className="modal-header">
          <div className="modal-title">🎯 欢迎来到 LingoLadder · 语阶英语</div>
        </div>
        <div className="modal-body">
          <p style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
            开始学习前，先做一次<strong>初始定级测评</strong>，帮你找到真实起点：
          </p>
          <div style={{ lineHeight: 1.9, fontSize: 14 }}>
            <div>💬 3-4 轮简短对话，约 5 分钟</div>
            <div>📊 评估你的 CEFR 水平（A1-C2）和薄弱维度</div>
            <div>🎯 测评结果决定资料难度和练习起点</div>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-2, #888)' }}>
            也可以先跳过，稍后在设置页测评或手动选择水平。
          </p>
        </div>
        <div className="modal-footer">
          <button className="modal-btn" onClick={onSkip}>稍后再说</button>
          <button className="modal-btn pr" onClick={onStart}>开始定级测评</button>
        </div>
      </div>
    </div>
  )
}
