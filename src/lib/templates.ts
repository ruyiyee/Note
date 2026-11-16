// Built-in note templates (TipTap-compatible HTML).
export interface Template { id: string; name: string; title: string; html: string }

export const TEMPLATES: Template[] = [
  { id: 'blank', name: 'Blank note', title: '', html: '<p></p>' },
  { id: 'lecture', name: 'Lecture / academic notes', title: 'Lecture: ',
    html: '<p><strong>Course:</strong> &nbsp;<strong>Date:</strong> &nbsp;<strong>Topic:</strong> </p><h2>Key concepts</h2><ul><li><p>Term :: definition</p></li></ul><h2>Notes</h2><p></p><h2>Questions to review</h2><ul><li><p>Question? Answer</p></li></ul><h2>Summary</h2><p></p>' },
  { id: 'research', name: 'Research', title: 'Research: ',
    html: '<h2>Question</h2><p></p><h2>Sources</h2><table><tbody><tr><th><p>Source</p></th><th><p>Key finding</p></th><th><p>Reliability</p></th></tr><tr><td><p></p></td><td><p></p></td><td><p></p></td></tr></tbody></table><h2>Findings</h2><p></p><h2>Open questions</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>' },
  { id: 'meeting', name: 'Meeting', title: 'Meeting: ',
    html: '<p><strong>Date:</strong> &nbsp;<strong>Attendees:</strong> </p><h2>Agenda</h2><ol><li><p></p></li></ol><h2>Notes</h2><p></p><h2>Decisions</h2><ul><li><p></p></li></ul><h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Task @YYYY-MM-DD</p></li></ul>' },
  { id: 'plan', name: 'Weekly plan', title: 'Week of ',
    html: '<h2>Goals</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul><h2>Schedule</h2><table><tbody><tr><th><p>Day</p></th><th><p>Focus</p></th></tr><tr><td><p>Mon</p></td><td><p></p></td></tr><tr><td><p>Tue</p></td><td><p></p></td></tr><tr><td><p>Wed</p></td><td><p></p></td></tr><tr><td><p>Thu</p></td><td><p></p></td></tr><tr><td><p>Fri</p></td><td><p></p></td></tr></tbody></table><h2>Reflection</h2><p></p>' },
  { id: 'vocab', name: 'Vocabulary list', title: 'Vocabulary: ',
    html: '<p>One word per line as <code>word :: meaning</code>. Use “Make flashcards” to study them.</p><ul><li><p>word :: meaning</p></li></ul>' },
];
