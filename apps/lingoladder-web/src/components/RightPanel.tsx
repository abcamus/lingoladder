import { useState } from 'react'
import type { Material, Mission, Skill, VocabularyGroup } from '../types'
import { MaterialsTab } from './MaterialsTab'
import { MissionsTab } from './MissionsTab'
import { ProgressTab } from './ProgressTab'
import { VocabularyTab } from './VocabularyTab'

interface RightPanelProps {
  materials: Material[]
  missions: Mission[]
  skills: Skill[]
  streakDays: number
  vocabulary: VocabularyGroup[]
  onUpload: () => void
  onAiFind: () => void
  onDeleteMaterial: (id: string) => void
  onAnalyzeMaterial: (id: string) => void
  onPracticeMaterial: (id: string) => void
  onReviewVocabulary: () => void
}

type TabId = 'materials' | 'vocabulary' | 'missions' | 'progress'

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'materials', icon: '📚', label: '资料' },
  { id: 'vocabulary', icon: '🔤', label: '词汇' },
  { id: 'missions', icon: '🎯', label: '任务' },
  { id: 'progress', icon: '📈', label: '进度' },
]

export function RightPanel({
  materials,
  missions,
  skills,
  streakDays,
  vocabulary,
  onUpload,
  onAiFind,
  onDeleteMaterial,
  onAnalyzeMaterial,
  onPracticeMaterial,
  onReviewVocabulary,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('materials')

  return (
    <div className="right">
      <div className="tabs">
        {TABS.map(tab => (
          <div
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab.id) }}
          >
            <span className="tab-ic">{tab.icon}</span>
            {tab.label}
          </div>
        ))}
      </div>

      <div className="right-sc">
        {activeTab === 'materials' && (
          <MaterialsTab
            materials={materials}
            onUpload={onUpload}
            onAiFind={onAiFind}
            onDelete={onDeleteMaterial}
            onAnalyze={onAnalyzeMaterial}
            onPractice={onPracticeMaterial}
          />
        )}
        {activeTab === 'vocabulary' && <VocabularyTab groups={vocabulary} onReview={onReviewVocabulary} />}
        {activeTab === 'missions' && <MissionsTab missions={missions} />}
        {activeTab === 'progress' && <ProgressTab skills={skills} streakDays={streakDays} />}
      </div>
    </div>
  )
}
