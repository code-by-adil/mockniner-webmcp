import React, { useRef, useState, useEffect } from 'react';
import { HighlightMenu } from './HighlightMenu';
import { Trash2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  className?: string;
}

export const HighlightableArea: React.FC<Props> = ({ children, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [menuState, setMenuState] = useState<{
    visible: boolean;
    position: { x: number; y: number } | null;
    mode: 'selection' | 'edit';
    highlightId?: string;
  }>({ visible: false, position: null, mode: 'selection' });

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showNoteInput, setShowNoteInput] = useState<string | null>(null);

  // Clear menu on global click if not clicking the menu or a highlight
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.ielts-highlight') && !target.closest('.highlight-menu-container') && !target.closest('.note-hint')) {
        setMenuState(prev => ({ ...prev, visible: false }));
      }
    };
    const handleNativeDismiss = () => {
      setMenuState((prev) => ({ ...prev, visible: false }));
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('exam-highlight-menu-dismiss', handleNativeDismiss);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('exam-highlight-menu-dismiss', handleNativeDismiss);
    };
  }, []);

  const handleMouseUp = () => {
    const selection = window.getSelection();
    // Check if valid selection exists within our container
    if (selection && !selection.isCollapsed && containerRef.current?.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Ensure visual width exists (avoid empty selections)
        if (rect.width > 0) {
             setMenuState({
                visible: true,
                position: { x: rect.left + rect.width / 2, y: rect.top },
                mode: 'selection'
             });
        }
    }
  };

  const handleHighlightClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Check if the click was on the note hint
    const hint = target.closest('.note-hint');
    if (hint) {
        e.preventDefault();
        e.stopPropagation();
        const parentSpan = hint.parentElement;
        if (parentSpan) {
            const id = parentSpan.dataset.highlightId;
            if (id) {
                setShowNoteInput(id);
                setMenuState(prev => ({ ...prev, visible: false }));
            }
        }
        return;
    }

    if (target.classList.contains('ielts-highlight')) {
      e.stopPropagation(); // Prevent document click handler
      e.preventDefault();  // Prevent text selection logic

      const id = target.dataset.highlightId;
      if (id) {
          const rect = target.getBoundingClientRect();
          setMenuState({
            visible: true,
            position: { x: rect.left + rect.width / 2, y: rect.top },
            mode: 'edit',
            highlightId: id
          });
      }
    }
  };

  const applyHighlight = (): string | null => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;

    const range = selection.getRangeAt(0);
    const highlightId = Date.now().toString();

    // Helper to wrap a single text node in a span
    const wrapNode = (node: Node) => {
        const span = document.createElement('span');
        span.className = 'ielts-highlight';
        span.dataset.highlightId = highlightId;
        span.textContent = node.nodeValue;
        node.parentNode?.replaceChild(span, node);
    };

    // Find all text nodes within the range
    const nodeIterator = document.createNodeIterator(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
                if (node.parentElement?.classList.contains('ielts-highlight')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const textNodes: { node: Node; start: number; end: number }[] = [];
    let currentNode = nodeIterator.nextNode();
    while (currentNode) {
        textNodes.push({
            node: currentNode,
            start: currentNode === range.startContainer ? range.startOffset : 0,
            end: currentNode === range.endContainer ? range.endOffset : (currentNode.nodeValue?.length || 0)
        });
        currentNode = nodeIterator.nextNode();
    }

    // Process nodes to highlight
    textNodes.forEach(({ node, start, end }) => {
        const text = node.nodeValue;
        if (!text) return;

        let targetNode = node;

        // Split text node if the highlight doesn't cover the whole node
        if (end < text.length) {
            (targetNode as Text).splitText(end);
        }
        if (start > 0) {
            targetNode = (targetNode as Text).splitText(start);
        }

        wrapNode(targetNode);
    });

    selection.removeAllRanges();
    return highlightId;
  };

  // Helper to safely remove highlight by extracting text content only
  const unwrapSpan = (span: Element) => {
      const parent = span.parentNode;
      if (!parent) return;

      let textContent = '';
      // Iterate over child nodes to find text nodes, ignoring the hint span
      span.childNodes.forEach(child => {
          if (child.nodeType === Node.TEXT_NODE) {
              textContent += child.nodeValue;
          }
      });

      const textNode = document.createTextNode(textContent);
      parent.replaceChild(textNode, span);
      parent.normalize(); // Merge adjacent text nodes
  };

  const removeHighlight = (id: string) => {
    const spans = document.querySelectorAll(`.ielts-highlight[data-highlight-id="${id}"]`);
    spans.forEach(span => unwrapSpan(span));

    setMenuState(prev => ({ ...prev, visible: false }));
    const newNotes = { ...notes };
    delete newNotes[id];
    setNotes(newNotes);
  };

  const clearAll = () => {
    const spans = document.querySelectorAll('.ielts-highlight');
    spans.forEach(span => unwrapSpan(span));

    setMenuState(prev => ({ ...prev, visible: false }));
    setNotes({});
  };

  // --- Menu Actions ---

  const onMenuHighlight = () => {
      applyHighlight();
      setMenuState(prev => ({ ...prev, visible: false }));
  };

  const onMenuNote = () => {
      let id = menuState.highlightId;
      if (menuState.mode === 'selection') {
          id = applyHighlight() || undefined;
      }
      setMenuState(prev => ({ ...prev, visible: false }));
      if (id) {
          setShowNoteInput(id);
      }
  };

  const saveNote = (id: string, text: string) => {
    setNotes(prev => {
        const next = { ...prev };
        if (text.trim()) {
            next[id] = text;
        } else {
            delete next[id];
        }
        return next;
    });
    setShowNoteInput(null);

    const spans = document.querySelectorAll(`.ielts-highlight[data-highlight-id="${id}"]`);
    const lastSpan = spans[spans.length - 1];

    spans.forEach(span => {
        if (text.trim()) {
            span.classList.add('has-note');
        } else {
            span.classList.remove('has-note');
            // Remove hint from all spans if removing note
            const existingHint = span.querySelector('.note-hint');
            if (existingHint) existingHint.remove();
        }
    });

    // Add hint to the last span if a note exists
    if (text.trim() && lastSpan) {
        if (!lastSpan.querySelector('.note-hint')) {
             const hint = document.createElement('span');
             hint.className = 'note-hint';
             hint.title = 'View Note';
             lastSpan.appendChild(hint);
        }
    }
  };

  return (
    <div
        ref={containerRef}
        className={className}
        onMouseUp={handleMouseUp}
        onClick={handleHighlightClick}
    >
      {children}

      <HighlightMenu
        position={menuState.visible ? menuState.position : null}
        mode={menuState.mode}
        onHighlight={onMenuHighlight}
        onNote={onMenuNote}
        onClear={() => menuState.highlightId && removeHighlight(menuState.highlightId)}
        onClearAll={clearAll}
      />

      {showNoteInput && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-transparent" onClick={() => setShowNoteInput(null)}>
            {/* Note Popup */}
            <div
                className="bg-[#fff9c4] w-72 rounded-sm shadow-[0_4px_20px_rgba(0,0,0,0.15)] border border-[#e2d786] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)'
                }}
            >
                <div className="bg-[#f0e68c] px-3 py-2 flex items-center justify-between border-b border-[#e2d786]">
                    <h4 className="font-bold text-xs text-yellow-900 uppercase tracking-wide">Note</h4>
	                    <button
	                        type="button"
	                        aria-label="Close note"
	                        onClick={() => setShowNoteInput(null)}
	                        className="text-yellow-900 hover:bg-yellow-200 rounded p-0.5"
	                    >
	                        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
	                    </button>
                </div>
                <div className="p-3">
	                    <textarea
	                        aria-label="Note text"
	                        className="w-full h-32 text-sm bg-transparent border-none focus:ring-0 resize-none text-gray-800 placeholder-yellow-700/50 leading-relaxed"
	                        placeholder="Type your notes here…"
	                        defaultValue={notes[showNoteInput] || ''}
	                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                saveNote(showNoteInput, (e.target as HTMLTextAreaElement).value);
                            }
                        }}
                        onBlur={(e) => saveNote(showNoteInput, e.target.value)}
                    />
                </div>
                <div className="bg-[#fff9c4] p-2 flex justify-between items-center border-t border-[#f0e68c]">
	                     <button
	                        type="button"
	                        aria-label="Delete note"
	                        onMouseDown={(e) => e.preventDefault()} // Prevent blur of textarea
	                        onClick={() => saveNote(showNoteInput, '')}
                        className="text-yellow-900/60 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"
                        title="Delete Note"
                    >
	                        <Trash2 size={16} aria-hidden="true" />
	                    </button>
	                     <button
	                        type="button"
	                        onMouseDown={(e) => e.preventDefault()} // Prevent blur of textarea
                        onClick={(e) => {
                            const textarea = e.currentTarget.parentElement?.parentElement?.querySelector('textarea');
                            if (textarea) saveNote(showNoteInput, textarea.value);
                        }}
                        className="text-xs font-bold text-yellow-900 hover:bg-[#f0e68c] px-3 py-1.5 rounded transition-colors"
                    >
                        Save Note
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
