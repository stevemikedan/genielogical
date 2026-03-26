import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileDropZone } from './FileDropZone.tsx';
import { TreeProvider } from '@/context/tree-context.tsx';

function renderWithProvider() {
  return render(
    <TreeProvider>
      <FileDropZone />
    </TreeProvider>,
  );
}

describe('FileDropZone', () => {
  it('renders the drop prompt text', () => {
    renderWithProvider();
    expect(screen.getByText('Drop a GEDCOM file to get started')).toBeInTheDocument();
  });

  it('renders the .ged label', () => {
    renderWithProvider();
    expect(screen.getByText('.ged')).toBeInTheDocument();
  });

  it('shows click/drag instruction text', () => {
    renderWithProvider();
    expect(screen.getByText('Click or drag & drop')).toBeInTheDocument();
  });

  it('renders the file input element', () => {
    renderWithProvider();
    // The file input is hidden but present in the DOM
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();
  });

  it('file input accepts .ged files', () => {
    renderWithProvider();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.accept).toBe('.ged');
  });

  it('file input has hidden class', () => {
    renderWithProvider();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.className).toContain('hidden');
  });

  it('renders the folder icon initially', () => {
    renderWithProvider();
    // The folder icon is the emoji character U+1F4C2
    expect(screen.getByText('\u{1F4C2}')).toBeInTheDocument();
  });
});
