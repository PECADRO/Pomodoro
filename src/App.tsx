import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Plus, GripVertical, CheckCircle2, Circle, Clock, AlertCircle, 
  Play, Pause, RotateCcw, ChevronLeft, Trash2, ChevronUp, ChevronDown, Image as ImageIcon,
  MoreHorizontal
} from 'lucide-react';

const QUOTES = [
  "Seneca: \"It takes a whole lifetime to learn how to live.\"",
  "Marcus Aurelius: \"The quality of your thoughts determines the quality of your life."",
  "Epiktetos: \"It is not events that disturb us, but our view of them.\"",
  
];

const INITIAL_TASKS = [
{ id: '1', title: 'Complete UI design', notes: 'User-friendly, minimal.', subtasks: '', resources: '', blockers: '', status: 'todo', collapsed: false, pane1Title: 'Ideas / Notes', pane2Title: 'Subtasks', pane3Title: 'Resources & Links', pane4Title: 'Risks & Blockers' },
{ id: '2', title: 'API integration', notes: 'Will connect to backend services.', subtasks: '', resources: '', blockers: '', status: 'in-progress', collapsed: false, pane1Title: 'Ideas / Notes', pane2Title: 'Subtasks', pane3Title: 'Resources & Links', pane4Title: 'Risks & Blockers' }
];

const INITIAL_COLUMNS = [
{ id: 'todo', title: 'To Do', color: 'slate', x: 20, y: 100, collapsed: false },
{ id: 'in-progress', title: 'In Progress', color: 'indigo', x: 360, y: 100, collapsed: false },
{ id: 'paused', title: 'Stuck / On Hold', color: 'red', x: 700, y: 100, collapsed: false },
{ id: 'done', title: 'Completed', color: 'emerald', x: 1040, y: 100, collapsed: false }
];

// Types
type Task = {
  id: string;
  title: string;
  notes: string;
  subtasks: string;
  resources: string;
  blockers: string;
  status: string;
  collapsed: boolean;
  pane1Title: string;
  pane2Title: string;
  pane3Title: string;
  pane4Title: string;
};

type Column = {
  id: string;
  title: string;
  color: string;
  x: number;
  y: number;
  collapsed: boolean;
};

type ImageItem = {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type HistoryEntry = { tasks: Task[]; columns: Column[]; images: ImageItem[] };

type DragState = {
  isDragging: boolean;
  pending: boolean;
  type: 'task' | 'column' | 'image' | null;
  item: Task | Column | ImageItem | null;
  startX: number;
  startY: number;
  startClientX: number;
  startClientY: number;
  pointerX: number;
  pointerY: number;
  offsetX: number;
  offsetY: number;
};

type ActiveMenu = { id: string | null; x: number; y: number };

export default function FocusFlowApp() {
  const [quote, setQuote] = useState("");
  
  // App State
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS as Task[]);
  const [columns, setColumns] = useState<Column[]>(INITIAL_COLUMNS as Column[]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // UI States
  const [newTaskTitles, setNewTaskTitles] = useState<Record<string, string>>({});
  const [expandedTask, setExpandedTask] = useState<Task | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [focusedTask, setFocusedTask] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>({ id: null, x: 0, y: 0 });

  // Drag Engine State
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false, pending: false, type: null, item: null,
    startX: 0, startY: 0, startClientX: 0, startClientY: 0, pointerX: 0, pointerY: 0,
    offsetX: 0, offsetY: 0
  });

  // Pomodoro States
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [pomodoros, setPomodoros] = useState(0);

  useEffect(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }, []);

  useEffect(() => {
    let interval: number | undefined;
    if (isActive && timeLeft > 0) {
      interval = window.setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      setPomodoros(p => p + 1);
      setTimeLeft(25 * 60);
    }
    return () => { if (interval) window.clearInterval(interval); };
  }, [isActive, timeLeft]);

  // Handle Paste for Images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it && it.type && it.type.indexOf('image') !== -1) {
          const blob = it.getAsFile();
          if (!blob) continue;
          const url = URL.createObjectURL(blob);
          const newImg: ImageItem = { id: Date.now().toString(), url, x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 100, width: 200, height: 200 };
          updateState(null, null, [...images, newImg]);
        }
      }
    };
    window.addEventListener('paste', handlePaste as EventListener);
    return () => window.removeEventListener('paste', handlePaste as EventListener);
  }, [images]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (e.key === 'Enter' && e.ctrlKey && expandedTask) {
          setExpandedTask(null);
        }
        return;
      }

      // Undo
      if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
        handleUndo();
        return;
      }

      // Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedTasks.length > 0) {
          updateState(tasks.filter(t => !selectedTasks.includes(t.id)), null, null);
          setSelectedTasks([]);
        }
        return;
      }

      // Selection / Navigation
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        
        if (selectedTasks.length === 0) {
          if (tasks.length > 0) setSelectedTasks([tasks[0].id]);
          return;
        }

        const currentId = selectedTasks[selectedTasks.length - 1];
        const currentTask = tasks.find(t => t.id === currentId);
        if (!currentTask) return;

        if (e.altKey) {
          // Move task
          let newTasks = [...tasks];
          const taskIndex = newTasks.findIndex(t => t.id === currentId);
          
          if (e.key === 'ArrowDown' && taskIndex < newTasks.length - 1) {
            [newTasks[taskIndex], newTasks[taskIndex + 1]] = [newTasks[taskIndex + 1], newTasks[taskIndex]];
          } else if (e.key === 'ArrowUp' && taskIndex > 0) {
            [newTasks[taskIndex], newTasks[taskIndex - 1]] = [newTasks[taskIndex - 1], newTasks[taskIndex]];
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
             const colIds = columns.map(c => c.id);
             const currentColIndex = colIds.indexOf(currentTask.status);
             let nextColIndex = e.key === 'ArrowLeft' ? currentColIndex - 1 : currentColIndex + 1;
             if (nextColIndex >= 0 && nextColIndex < colIds.length) {
                const nextColId = colIds[nextColIndex];
                selectedTasks.forEach(selId => {
                   const idx = newTasks.findIndex(t => t.id === selId);
                   if(idx !== -1) newTasks[idx].status = nextColId;
                });
             }
          }
          updateState(newTasks, null, null);
        } else {
          // Just select
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            const colTasks = tasks.filter(t => t.status === currentTask.status);
            const idx = colTasks.findIndex(t => t.id === currentId);
            const nextIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
            
            if (nextIdx >= 0 && nextIdx < colTasks.length) {
              const nextId = colTasks[nextIdx].id;
              if (e.ctrlKey) {
                 if (!selectedTasks.includes(nextId)) setSelectedTasks([...selectedTasks, nextId]);
              } else {
                 setSelectedTasks([nextId]);
              }
            }
          }
        }
      }

      if (e.key === 'Enter' && selectedTasks.length === 1) {
        setExpandedTask(tasks.find(t => t.id === selectedTasks[0]) || null);
      }
    };

    window.addEventListener('keydown', handleKeyDown as EventListener);
    return () => window.removeEventListener('keydown', handleKeyDown as EventListener);
  }, [tasks, selectedTasks, columns, expandedTask]);

  const saveToHistory = () => {
    setHistory(prev => [...prev.slice(-19), { tasks: JSON.parse(JSON.stringify(tasks)), columns: JSON.parse(JSON.stringify(columns)), images: JSON.parse(JSON.stringify(images)) }]);
  };

  const updateState = (newTasks: Task[] | null, newColumns: Column[] | null, newImages: ImageItem[] | null) => {
    saveToHistory();
    if (newTasks) setTasks(newTasks);
    if (newColumns) setColumns(newColumns);
    if (newImages) setImages(newImages);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setTasks(previousState.tasks);
    setColumns(previousState.columns);
    setImages(previousState.images);
    setHistory(prev => prev.slice(0, -1));
  };

  const toggleColumnCollapse = (id: string) => {
    setColumns(prev => prev.map(c => c.id === id ? { ...c, collapsed: !c.collapsed } : c));
  };

  const toggleTaskCollapse = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setTasks(prev => prev.map(t => t.id === id ? { ...t, collapsed: !t.collapsed } : t));
  };

  const handleAddTask = (e: React.FormEvent, colId: string) => {
    e.preventDefault();
    const title = newTaskTitles[colId] || '';
    if (!title.trim()) return;
    const newTask = { 
        id: Date.now().toString(), 
        title, notes: '', subtasks: '', resources: '', blockers: '', status: colId, collapsed: false,
        pane1Title: 'Fikirler / Notlar', pane2Title: 'Alt Parçalar', pane3Title: 'Kaynaklar & Linkler', pane4Title: 'Riskler & Engeller'
    };
    updateState([...tasks, newTask], null, null);
    setNewTaskTitles(prev => ({ ...prev, [colId]: '' }));
  };

  const handleGlobalClick = (e: React.MouseEvent<HTMLDivElement>) => {
    setActiveMenu({ id: null, x: 0, y: 0 });
    const target = e.target as HTMLElement | null;
    if (target && (target.id === 'canvas-bg' || target.tagName === 'HEADER')) {
      setSelectedTasks([]);
      setFocusedTask(null);
    }
  };

  const onPointerDown = (e: React.PointerEvent, item: Task | Column | ImageItem, type: 'task' | 'column' | 'image') => {
    const targetEl = e.target as HTMLElement | null;
    if (e.nativeEvent instanceof PointerEvent && (e.nativeEvent.button !== 0)) return;
    if (targetEl && (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA' || targetEl.tagName === 'BUTTON' || targetEl.closest('button'))) return;
    e.stopPropagation();

    const rect = (e.currentTarget as Element).getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    setDragState({
      pending: true,
      isDragging: false,
      type, item, offsetX, offsetY,
      pointerX: e.clientX, pointerY: e.clientY,
      startClientX: e.clientX, startClientY: e.clientY,
      startX: type === 'task' ? rect.left : (item as any).x ?? 0,
      startY: type === 'task' ? rect.top : (item as any).y ?? 0
    });

    if (type === 'task') {
      const taskItem = item as Task;
      const native = e.nativeEvent as PointerEvent;
      if (!native.ctrlKey) {
        if (!selectedTasks.includes(taskItem.id)) setSelectedTasks([taskItem.id]);
      } else {
        setSelectedTasks(prev => prev.includes(taskItem.id) ? prev.filter(id => id !== taskItem.id) : [...prev, taskItem.id]);
      }
    }
  };

  useEffect(() => {
    if (!dragState.isDragging && !dragState.pending) return;

    const onPointerMove = (e: PointerEvent) => {
      if (dragState.pending) {
        const dist = Math.sqrt(Math.pow(e.clientX - dragState.startClientX, 2) + Math.pow(e.clientY - dragState.startClientY, 2));
        if (dist > 3) { // Threshold for drag vs click
          setDragState(prev => ({ ...prev, pending: false, isDragging: true, pointerX: e.clientX, pointerY: e.clientY }));
        }
        return;
      }

      setDragState(prev => ({ ...prev, pointerX: e.clientX, pointerY: e.clientY }));
      
      if (dragState.type === 'column' && dragState.item) {
        const colItem = dragState.item as Column;
        setColumns(prev => prev.map(c => c.id === colItem.id ? { ...c, x: e.clientX - dragState.offsetX, y: e.clientY - dragState.offsetY } : c));
      } else if (dragState.type === 'image' && dragState.item) {
        const imgItem = dragState.item as ImageItem;
        setImages(prev => prev.map(img => img.id === imgItem.id ? { ...img, x: e.clientX - dragState.offsetX, y: e.clientY - dragState.offsetY } : img));
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (dragState.pending) {
         setDragState({ isDragging: false, pending: false, type: null, item: null, pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0, startX: 0, startY: 0, startClientX: 0, startClientY: 0 });
         return;
      }

      saveToHistory();

      if (dragState.type === 'task' && dragState.item) {
        const dragged = dragState.item as Task;
        const colElements = document.querySelectorAll('.column-container');
        let targetColId: string = dragged.status;
        let targetColEl: Element | null = null;
        
        for (let colEl of colElements) {
          const rect = colEl.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            targetColId = colEl.getAttribute('data-id') || targetColId;
            targetColEl = colEl;
            break;
          }
        }
        
        let dropIndex = -1;
        if (targetColEl) {
            const taskCards = targetColEl.querySelectorAll('.task-card:not(.floating-ghost)');
            for (let i = 0; i < taskCards.length; i++) {
                const rect = taskCards[i].getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    dropIndex = i;
                    break;
                }
            }
        }
        
        const tasksToMove = selectedTasks.includes(dragged.id) ? selectedTasks : [dragged.id];
        
        setTasks(prev => {
            const newTasks = [...prev];
            const draggedTasksData = newTasks.filter(t => tasksToMove.includes(t.id));
            const remainingTasks = newTasks.filter(t => !tasksToMove.includes(t.id));
            
            draggedTasksData.forEach(t => t.status = targetColId);
            
            if (dropIndex === -1) {
                return [...remainingTasks, ...draggedTasksData];
            } else {
                const targetColTasks = remainingTasks.filter(t => t.status === targetColId);
                if (dropIndex < targetColTasks.length) {
                    const taskBeforeId = targetColTasks[dropIndex].id;
                    const absoluteIndex = remainingTasks.findIndex(t => t.id === taskBeforeId);
                    remainingTasks.splice(absoluteIndex, 0, ...draggedTasksData);
                    return remainingTasks;
                } else {
                    return [...remainingTasks, ...draggedTasksData];
                }
            }
        });
      }

      setDragState({ isDragging: false, pending: false, type: null, item: null, pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0, startX: 0, startY: 0, startClientX: 0, startClientY: 0 });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => { window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp); };
  }, [dragState, selectedTasks]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };


  return (
    <div 
       id="canvas-bg"
       className="min-h-screen bg-slate-900 text-slate-200 font-sans overflow-hidden fixed inset-0"
       onClick={handleGlobalClick}
       style={{ 
         backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)', 
         backgroundSize: '32px 32px' 
       }}
    >
      
      {/* HEADER / TOP BAR */}
      <header className="fixed top-0 left-0 right-0 p-6 z-40 pointer-events-none flex flex-col items-center">
        {/* Pomodoro Timer (Top Left) */}
        <div className="absolute top-6 left-6 pointer-events-auto">
          <div className="flex items-center gap-3 bg-slate-800/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-700/50 shadow-lg">
            <Clock size={18} className="text-indigo-400" />
            <span className="text-xl font-bold font-mono text-slate-100">{formatTime(timeLeft)}</span>
            <div className="flex items-center gap-1 ml-2">
              <button onClick={() => setIsActive(!isActive)} className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors">
                {isActive ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button onClick={() => { setIsActive(false); setTimeLeft(25 * 60); }} className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors">
                <RotateCcw size={16} />
              </button>
            </div>
            <div className="w-[1px] h-6 bg-slate-700/50 mx-1"></div>
            <div className="px-2 flex items-center gap-1.5 text-sm font-medium text-slate-400 select-none">
               🍅 x <span className="text-slate-200 font-bold">{pomodoros}</span>
            </div>
          </div>
        </div>

        {/* Stoic Quote (Center) */}
        <p className="text-slate-400 text-sm md:text-base italic max-w-2xl text-center pointer-events-auto bg-slate-900/50 px-6 py-2 rounded-full border border-slate-800/50">
          {quote}
        </p>
      </header>

      {/* INFINITE CANVAS ITEMS */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        
        {/* Render Columns */}
        {columns.map(col => (
          <div
            key={col.id}
            data-id={col.id}
            className={`column-container pointer-events-auto absolute flex flex-col gap-3 rounded-2xl p-4 shadow-xl border select-none transition-colors
              ${col.id === 'paused' ? 'bg-red-500/5 border-red-900/30' : 'bg-slate-800/50 border-slate-700/50 backdrop-blur-sm'}
              ${dragState.isDragging && dragState.item?.id === col.id ? 'opacity-80 ring-2 ring-indigo-500' : ''}
            `}
            style={{ 
              left: col.x, top: col.y, 
              width: col.collapsed ? 'auto' : '320px', 
              height: col.collapsed ? 'auto' : 'auto',
              minHeight: col.collapsed ? 'auto' : '150px',
              resize: col.collapsed ? 'none' : 'both', overflow: 'auto'
            }}
          >
            {/* Column Header */}
            <div 
               className="flex items-center justify-between cursor-grab active:cursor-grabbing pb-1" 
               onPointerDown={(e) => onPointerDown(e, col, 'column')}
               onDoubleClick={(e) => { e.stopPropagation(); toggleColumnCollapse(col.id); }}
            >
              <div className="flex items-center gap-2 pointer-events-none">
                <div className={`w-3 h-3 rounded-full bg-${col.color}-500/80 shadow-[0_0_8px_rgba(0,0,0,0.5)] shadow-${col.color}-500/50`}></div>
                <h2 className="font-semibold text-slate-100 tracking-wide">{col.title}</h2>
                <span className="text-xs font-medium bg-slate-900/50 text-slate-400 px-2 py-0.5 rounded-full ml-1">
                  {tasks.filter(t => t.status === col.id).length}
                </span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); toggleColumnCollapse(col.id); }} className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-md hover:bg-slate-700/50 pointer-events-auto">
                {col.collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            </div>

            {/* Column Body / Tasks */}
            {!col.collapsed && (
              <>
                <form onSubmit={(e) => handleAddTask(e, col.id)} className="mt-1 group">
                  <div className="relative">
                     <Plus size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                     <input
                        type="text"
                        placeholder="Görev ekle..."
                        value={newTaskTitles[col.id] || ''}
                        onChange={(e) => setNewTaskTitles(prev => ({ ...prev, [col.id]: e.target.value }))}
                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-2 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:bg-slate-800/80 transition-all"
                     />
                  </div>
                </form>

                <div className="flex flex-col gap-3 flex-1 min-h-[50px] overflow-visible mt-1">
                  {tasks.filter(t => t.status === col.id).map(task => {
                    const isSelected = selectedTasks.includes(task.id);
                    const isFocused = focusedTask === task.id;
                    const isDraggingThisTask = dragState.isDragging && dragState.type === 'task' && !!dragState.item && (dragState.item as Task).id === task.id;

                    if (isDraggingThisTask) {
                      return <div key={`placeholder-${task.id}`} className="h-[80px] border-2 border-dashed border-indigo-500/30 rounded-xl bg-indigo-500/5 transition-all"></div>
                    }

                    return (
                      <div
                        key={task.id}
                        onPointerDown={(e) => onPointerDown(e, task, 'task')}
                        onDoubleClick={(e) => { e.stopPropagation(); setExpandedTask(task); }}
                        className={`task-card group bg-slate-800 border rounded-xl p-3 cursor-grab active:cursor-grabbing select-none hover:border-slate-600 transition-colors
                          ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'border-slate-700/80'}
                          ${isFocused ? 'bg-slate-700' : ''}
                        `}
                      >
                        <div className="flex items-start gap-2 pointer-events-none">
                          <div className="relative pointer-events-auto">
                            <button 
                               onClick={(e) => { 
                                 e.stopPropagation(); 
                                 const rect = e.currentTarget.getBoundingClientRect();
                                 setActiveMenu(activeMenu.id === task.id ? { id: null, x: 0, y: 0 } : { id: task.id, x: rect.left, y: rect.bottom + 4 }); 
                               }} 
                               className="mt-0.5 text-slate-500 hover:text-slate-300 transition-colors p-1 -ml-1 rounded hover:bg-slate-700"
                            >
                              <MoreHorizontal size={16} />
                            </button>
                          </div>
                          
                          <div className="flex-1 min-w-0 pointer-events-auto" onDoubleClick={(e) => { e.stopPropagation(); setExpandedTask(task); }}>
                            <div className="flex justify-between items-start gap-2">
                              <h3 className={`text-[15px] font-medium leading-snug ${task.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                                {task.title}
                              </h3>
                              <button onClick={(e) => toggleTaskCollapse(e, task.id)} className="text-slate-500 hover:text-slate-300 pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                {task.collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                              </button>
                            </div>
                            
                            {!task.collapsed && task.notes && (
                              <p className="mt-2 text-xs text-slate-400 line-clamp-2 leading-relaxed border-l-2 border-slate-700 pl-2 pointer-events-auto">
                                {task.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ))}

        {/* Render Images */}
        {images.map(img => (
          <div
            key={img.id}
            onPointerDown={(e) => onPointerDown(e, img, 'image')}
            className="absolute pointer-events-auto rounded-lg overflow-hidden border border-slate-700 shadow-xl cursor-grab active:cursor-grabbing group bg-slate-800"
            style={{ left: img.x, top: img.y, width: img.width, height: img.height, resize: 'both' }}
          >
            <img src={img.url} className="w-full h-full object-cover pointer-events-none" alt="Pasted" />
            <button onClick={() => updateState(null, null, images.filter(i => i.id !== img.id))} className="absolute top-2 right-2 bg-red-500/80 text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Custom Drag Pointer Ghost */}
      {dragState.isDragging && dragState.type === 'task' && (
        <div 
           className="fixed floating-ghost group bg-slate-800 border-2 border-indigo-500/80 rounded-xl p-3 select-none w-[280px] shadow-2xl z-50 pointer-events-none rotate-3 scale-105 transition-transform"
           style={{
             left: dragState.pointerX - dragState.offsetX,
             top: dragState.pointerY - dragState.offsetY,
           }}
        >
          <div className="flex items-start gap-2">
            <MoreHorizontal size={16} className="mt-0.5 text-indigo-400" />
            <div className="flex-1 min-w-0">
              <h3 className="text-[15px] font-medium leading-snug text-slate-200">{dragState.item && dragState.type === 'task' ? (dragState.item as Task).title : ''}</h3>
            </div>
          </div>
        </div>
      )}

      {/* Global Context Menu (3 dots) */}
      {activeMenu.id && (
        <div 
           className="fixed bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-[100] flex flex-col p-1 w-32"
           style={{ left: activeMenu.x, top: activeMenu.y }}
           onClick={(e) => e.stopPropagation()}
        >
           <button onClick={(e) => { e.stopPropagation(); setExpandedTask(tasks.find(t => t.id === activeMenu.id) || null); setActiveMenu({id:null, x:0, y:0}); }} className="px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white w-full text-left rounded-md">Düzenle</button>
           <button onClick={(e) => { e.stopPropagation(); updateState(tasks.filter(t => t.id !== activeMenu.id), null, null); setActiveMenu({id:null, x:0, y:0}); }} className="px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 w-full text-left rounded-md">Sil</button>
        </div>
      )}

      {/* 4-Pane Detail Modal */}
      {expandedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-slate-950/70 backdrop-blur-sm" onClick={() => setExpandedTask(null)}>
          <div 
            className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/30">
              <input 
                type="text" 
                value={expandedTask.title}
                onChange={(e) => {
                  const val = e.target.value;
                  setExpandedTask(prev => prev ? ({ ...prev, title: val }) : prev);
                  setTasks(prev => prev.map(t => t.id === expandedTask!.id ? { ...t, title: val } : t));
                }}
                className="bg-transparent text-2xl font-semibold text-slate-100 focus:outline-none w-full mr-4 placeholder-slate-600 py-1"
                placeholder="Görev başlığı..."
              />
              <div className="flex items-center gap-3">
                 <span className="text-xs font-medium bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full border border-indigo-500/20 whitespace-nowrap">
                   {columns.find(c => c.id === expandedTask.status)?.title}
                 </span>
                 <button onClick={() => setExpandedTask(null)} className="text-slate-400 hover:text-white transition-colors bg-slate-800 p-2 rounded-xl hover:bg-slate-700">
                   Kapat
                 </button>
              </div>
            </div>
            
            {/* Modal 4 Panes Grid */}
            <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">
              
              {/* Pane 1: Notes */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 border-b border-slate-800/50 pb-1">
                  <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></div>
                  <input 
                     type="text" 
                     value={expandedTask.pane1Title || 'Fikirler / Notlar'} 
                     onChange={(e) => {
                       const val = e.target.value;
                       setExpandedTask(prev => prev ? ({ ...prev, pane1Title: val }) : prev);
                       setTasks(prev => prev.map(t => t.id === expandedTask!.id ? { ...t, pane1Title: val } : t));
                     }}
                     className="bg-transparent text-sm font-semibold text-slate-400 focus:text-slate-200 focus:outline-none w-full"
                  />
                </div>
                <textarea
                  value={expandedTask.notes}
                  onChange={(e) => {
                    const val = e.target.value;
                    setExpandedTask(prev => prev ? ({ ...prev, notes: val }) : prev);
                    setTasks(prev => prev.map(t => t.id === expandedTask!.id ? { ...t, notes: val } : t));
                  }}
                  className="flex-1 w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-slate-300 focus:outline-none focus:border-blue-500/50 focus:bg-slate-900 resize-y transition-colors min-h-[150px]"
                />
              </div>

              {/* Pane 2: Subtasks */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 border-b border-slate-800/50 pb-1">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0"></div>
                  <input 
                     type="text" 
                     value={expandedTask.pane2Title || 'Alt Parçalar'} 
                     onChange={(e) => {
                       const val = e.target.value;
                       setExpandedTask(prev => prev ? ({ ...prev, pane2Title: val }) : prev);
                       setTasks(prev => prev.map(t => t.id === expandedTask!.id ? { ...t, pane2Title: val } : t));
                     }}
                     className="bg-transparent text-sm font-semibold text-slate-400 focus:text-slate-200 focus:outline-none w-full"
                  />
                </div>
                <textarea
                  value={expandedTask.subtasks}
                  onChange={(e) => {
                    const val = e.target.value;
                    setExpandedTask(prev => prev ? ({ ...prev, subtasks: val }) : prev);
                    setTasks(prev => prev.map(t => t.id === expandedTask!.id ? { ...t, subtasks: val } : t));
                  }}
                  className="flex-1 w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-slate-300 focus:outline-none focus:border-indigo-500/50 focus:bg-slate-900 resize-y transition-colors min-h-[150px]"
                />
              </div>

              {/* Pane 3: Resources */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 border-b border-slate-800/50 pb-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
                  <input 
                     type="text" 
                     value={expandedTask.pane3Title || 'Kaynaklar & Linkler'} 
                     onChange={(e) => {
                       const val = e.target.value;
                       setExpandedTask(prev => prev ? ({ ...prev, pane3Title: val }) : prev);
                       setTasks(prev => prev.map(t => t.id === expandedTask!.id ? { ...t, pane3Title: val } : t));
                     }}
                     className="bg-transparent text-sm font-semibold text-slate-400 focus:text-slate-200 focus:outline-none w-full"
                  />
                </div>
                <textarea
                  value={expandedTask.resources}
                  onChange={(e) => {
                    const val = e.target.value;
                    setExpandedTask(prev => prev ? ({ ...prev, resources: val }) : prev);
                    setTasks(prev => prev.map(t => t.id === expandedTask!.id ? { ...t, resources: val } : t));
                  }}
                  className="flex-1 w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-slate-300 focus:outline-none focus:border-emerald-500/50 focus:bg-slate-900 resize-y transition-colors min-h-[150px]"
                />
              </div>

              {/* Pane 4: Blockers / Risks */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 border-b border-slate-800/50 pb-1">
                  <div className="w-2 h-2 rounded-full bg-red-500 shrink-0"></div>
                  <input 
                     type="text" 
                     value={expandedTask.pane4Title || 'Riskler & Engeller'} 
                     onChange={(e) => {
                       const val = e.target.value;
                       setExpandedTask(prev => prev ? ({ ...prev, pane4Title: val }) : prev);
                       setTasks(prev => prev.map(t => t.id === expandedTask!.id ? { ...t, pane4Title: val } : t));
                     }}
                     className="bg-transparent text-sm font-semibold text-slate-400 focus:text-slate-200 focus:outline-none w-full"
                  />
                </div>
                <textarea
                  value={expandedTask.blockers}
                  onChange={(e) => {
                    const val = e.target.value;
                    setExpandedTask(prev => prev ? ({ ...prev, blockers: val }) : prev);
                    setTasks(prev => prev.map(t => t.id === expandedTask!.id ? { ...t, blockers: val } : t));
                  }}
                  className="flex-1 w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-slate-300 focus:outline-none focus:border-red-500/50 focus:bg-slate-900 resize-y transition-colors min-h-[150px]"
                />
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
