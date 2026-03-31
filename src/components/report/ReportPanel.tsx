import { useState, useCallback } from 'react';
import type { ReportType, ReportConfig, ReportResult, DataQualityReport } from '@/types/report.ts';
import { useReport } from '@/hooks/use-report.ts';
import { ReportCatalog } from './ReportCatalog.tsx';
import { ReportConfigPanel } from './ReportConfigPanel.tsx';
import { ReportProgress } from './ReportProgress.tsx';
import { ReportView } from './ReportView.tsx';
import { DataQualityReportView } from './DataQualityReportView.tsx';

interface ReportPanelProps {
  onSelectPerson: (personId: string) => void;
  onOpenSettings?: () => void;
}

type ReportPhase = 'catalog' | 'config' | 'generating' | 'results';

function isDataQualityReport(report: ReportResult | DataQualityReport): report is DataQualityReport {
  return report.config.reportType === 'data_quality';
}

export function ReportPanel({ onSelectPerson, onOpenSettings }: ReportPanelProps) {
  const { generateReport, cancelReport, estimateCost, activeReport, reportProgress } = useReport();
  const [phase, setPhase] = useState<ReportPhase>(activeReport ? 'results' : 'catalog');
  const [selectedType, setSelectedType] = useState<ReportType | null>(null);

  const handleSelectType = useCallback((type: ReportType) => {
    setSelectedType(type);
    setPhase('config');
  }, []);

  const handleGenerate = useCallback(async (config: ReportConfig) => {
    setPhase('generating');
    await generateReport(config);
    setPhase('results');
  }, [generateReport]);

  const handleNewReport = useCallback(() => {
    setPhase('catalog');
    setSelectedType(null);
  }, []);

  // Show progress while generating
  if (phase === 'generating' && reportProgress) {
    return (
      <div className="py-12">
        <ReportProgress progress={reportProgress} onCancel={cancelReport} />
      </div>
    );
  }

  // Show results
  if (phase === 'results' && activeReport) {
    if (isDataQualityReport(activeReport)) {
      return (
        <DataQualityReportView
          report={activeReport}
          onSelectPerson={onSelectPerson}
          onNewReport={handleNewReport}
        />
      );
    }
    return (
      <ReportView
        report={activeReport}
        onSelectPerson={onSelectPerson}
        onNewReport={handleNewReport}
      />
    );
  }

  // Show config panel
  if (phase === 'config' && selectedType) {
    return (
      <div className="py-8">
        <ReportConfigPanel
          reportType={selectedType}
          onGenerate={handleGenerate}
          onEstimate={estimateCost}
          onBack={handleNewReport}
          onOpenSettings={onOpenSettings}
        />
      </div>
    );
  }

  // Show catalog (default)
  return (
    <div className="py-8">
      <ReportCatalog onSelect={handleSelectType} />
    </div>
  );
}
