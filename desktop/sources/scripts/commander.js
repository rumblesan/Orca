'use strict'

export default function Commander (terminal) {
  this.isActive = false
  this.query = ''
  this.history = []
  this.historyIndex = 0
  this.editorMode = 'insert'
  this.vimMode = localStorage.getItem('vimMode') || 0;

  if (this.vimMode) { this.editorMode = 'command' }

  // Library

  this.passives = {
    'find': (p) => { terminal.cursor.find(p.str) },
    'select': (p) => { terminal.cursor.select(p.x, p.y, p.w, p.h) },
    'inject': (p) => { terminal.cursor.select(p._x, p._y); terminal.source.inject(p._str, false) },
    'write': (p) => { terminal.cursor.select(p._x, p._y, p._str.length) },
    'navmode': (p) => { this.setEditorMode(p.str) }
  }

  this.actives = {
    // Ports
    'osc': (p) => { terminal.io.osc.select(p.int) },
    'udp': (p) => { terminal.io.udp.select(p.int) },
    'ip': (p) => { terminal.io.setIp(p.str) },
    'cc': (p) => { terminal.io.cc.setOffset(p.int) },
    'pg': (p) => { terminal.io.cc.stack.push({ channel: clamp(p.ints[0], 0, 15), bank: p.ints[1], sub: p.ints[2], pgm: clamp(p.ints[3], 0, 127), type: 'pg' }); terminal.io.cc.run() },
    // Cursor
    'copy': (p) => { terminal.cursor.copy() },
    'paste': (p) => { terminal.cursor.paste(true) },
    'erase': (p) => { terminal.cursor.erase() },
    // Controls
    'play': (p) => { terminal.clock.play() },
    'stop': (p) => { terminal.clock.stop() },
    'run': (p) => { terminal.run() },
    // Speed
    'apm': (p) => { terminal.clock.setSpeed(null, p.int) },
    'bpm': (p) => { terminal.clock.setSpeed(p.int, p.int, true) },
    'time': (p) => { terminal.clock.setFrame(p.int) },
    'rewind': (p) => { terminal.clock.setFrame(terminal.orca.f - p.int) },
    'skip': (p) => { terminal.clock.setFrame(terminal.orca.f + p.int) },
    // Effects
    'rot': (p) => { terminal.cursor.rotate(p.int) },
    // Themeing
    'color': (p) => { terminal.theme.set('b_med', p.parts[0]); terminal.theme.set('b_inv', p.parts[1]); terminal.theme.set('b_high', p.parts[2]) },
    'graphic': (p) => { terminal.theme.setImage(terminal.source.locate(p.parts[0] + '.' + (p.parts[1] ? p.parts[1] : 'jpg'))) },
    // Edit
    'find': (p) => { terminal.cursor.find(p.str) },
    'select': (p) => { terminal.cursor.select(p.x, p.y, p.w, p.h) },
    'inject': (p) => { terminal.cursor.select(p._x, p._y); terminal.source.inject(p._str, true) },
    'write': (p) => { terminal.cursor.select(p._x, p._y, p._str.length); terminal.cursor.writeBlock([p._str.split('')]) }
  }

  // Make shorthands
  for (const id in this.actives) {
    this.actives[id.substr(0, 2)] = this.actives[id]
  }

  function Param (val) {
    this.str = `${val}`
    this.length = this.str.length
    this.chars = this.str.split('')
    this.int = !isNaN(val) ? parseInt(val) : null
    this.parts = val.split(';')
    this.ints = this.parts.map((val) => { return parseInt(val) })
    this.x = parseInt(this.parts[0])
    this.y = parseInt(this.parts[1])
    this.w = parseInt(this.parts[2])
    this.h = parseInt(this.parts[3])
    // Optionals Position Style
    this._str = this.parts[0]
    this._x = parseInt(this.parts[1])
    this._y = parseInt(this.parts[2])
  }

  // Begin

  this.start = function (q = '') {
    this.isActive = true
    this.query = q
    terminal.update()
  }

  this.stop = function () {
    this.isActive = false
    this.query = ''
    this.historyIndex = this.history.length
    terminal.update()
  }

  this.erase = function () {
    this.query = this.query.slice(0, -1)
    this.preview()
  }

  this.write = function (key) {
    if (key.length !== 1) { return }
    this.query += key
    this.preview()
  }

  this.run = function () {
    const tool = this.isActive === true ? 'commander' : 'cursor'
    terminal[tool].trigger()
    terminal.update()
  }

  this.trigger = function (msg = this.query, touch = true) {
    const cmd = `${msg}`.split(':')[0].toLowerCase()
    const val = `${msg}`.substr(cmd.length + 1)
    if (!this.actives[cmd]) { console.warn('Commander', `Unknown message: ${msg}`); this.stop(); return }
    console.info('Commander', msg)
    this.actives[cmd](new Param(val), true)
    if (touch === true) {
      this.history.push(msg)
      this.historyIndex = this.history.length
      this.stop()
    }
  }

  this.preview = function (msg = this.query) {
    const cmd = `${msg}`.split(':')[0].toLowerCase()
    const val = `${msg}`.substr(cmd.length + 1)
    if (!this.passives[cmd]) { return }
    this.passives[cmd](new Param(val), false)
  }

  // Events

  this.toggleVimMode = function (val) {
    this.vimMode = this.vimMode === 0 ? val : 0
    localStorage.setItem('vimMode', this.vimMode)
    if (this.vimMode === 0) {
      this.setEditorMode('insert')
    } else {
      this.setEditorMode('command')
    }
  }

  this.setEditorMode = function (mode) {
    if (
      mode !== 'insert' &&
      mode !== 'replace' &&
      mode !== 'replaceContinue' &&
      mode !== 'command'
    ) {
      console.warn(`Unknown editor mode: ${mode}`)
      return
    }
    this.editorMode = mode
  }

  this.resetControl = function () {
    terminal.toggleGuide(false)
    terminal.commander.stop()
    terminal.clear()
    terminal.isPaused = false
    terminal.cursor.reset()
  }

  this.onKeyDown = function (event) {
    if (this.editorMode === 'insert') { this.insertModeKeyMapping(event); return }
    if (this.editorMode === 'command') { this.commandModeKeyMapping(event); return }

    if (this.editorMode === 'replace') {
      this.insertModeKeyMapping(event)
      if (event.keyCode >= 48 && event.keyCode <= 90) {
        this.setEditorMode('command')
      }
      return
    }
  }

  this.promptModeKeyMapping = function (event) {
    const modifierOn = (event.metaKey || event.ctrlKey)

    if (event.key === '[' && modifierOn) { this.stop(); event.preventDefault(); return }
    if (event.key === 'Escape') { this.stop(); event.preventDefault(); return }

    if (event.key === 'Backspace') { this.erase(); event.preventDefault(); return }

    this.write(event.key)
  }

  this.commandModeKeyMapping = function (event) {
    if (this.isActive === true) { this.promptModeKeyMapping(event); return }

    const modifierOn = (event.metaKey || event.ctrlKey)
    const shiftOn = event.shiftKey

    // key: k
    if (event.keyCode === 75) { this.onCursorUp(shiftOn, modifierOn, event.altKey); event.preventDefault(); return }
    // key: j
    if (event.keyCode === 74) { this.onCursorDown(shiftOn, modifierOn, event.altKey); event.preventDefault(); return }
    // key: h
    if (event.keyCode === 72) { this.onCursorLeft(shiftOn, modifierOn, event.altKey); event.preventDefault(); return }
    // key: l
    if (event.keyCode === 76) { this.onCursorRight(shiftOn, modifierOn, event.altKey); event.preventDefault(); return }

    // swap case
    if (event.key === '~') {
      const c = terminal.cursor.read()
      if (/^[a-z]$/.test(c)) {
        terminal.cursor.write(c.toUpperCase())
      } else if (/^[A-Z]$/.test(c)) {
        terminal.cursor.write(c.toLowerCase())
      }
      return
    }

    if (event.key === '[' && modifierOn) { terminal.toggleGuide(false); terminal.commander.stop(); terminal.clear(); terminal.isPaused = false; terminal.cursor.reset(); return }
    if (event.key === 'Escape') { terminal.toggleGuide(false); terminal.commander.stop(); terminal.clear(); terminal.isPaused = false; terminal.cursor.reset(); return }

    // Deletion
    if (event.key === 'Backspace') { terminal[this.isActive === true ? 'commander' : 'cursor'].erase(); event.preventDefault(); return }
    // key: x
    if (event.keyCode === 88) { terminal.cursor.erase(); return }

    // Undo/Redo
    // key: r
    if (event.keyCode === 82 && modifierOn) { terminal.history.redo(); event.preventDefault(); return }
    // key: u
    if (event.keyCode === 85) { terminal.history.undo(); return }

    // Copy/Paste
    // key: y
    if (event.keyCode === 89) { terminal.cursor.copy(); return }
    // key: d
    if (event.keyCode === 68) { terminal.cursor.cut(); return }
    // key: P
    if (event.keyCode === 80 && shiftOn) { terminal.cursor.paste(true); return }
    // key: p
    if (event.keyCode === 80) { terminal.cursor.paste(false); return }
    // key: a
    if (event.keyCode === 65) { terminal.cursor.selectAll(); return }

    // key: Tab
    if (event.keyCode === 9) { terminal.toggleHardmode(); event.preventDefault(); return }

    // Toggle Command mode
    if (event.key === ':') { this.start(); return }

    // key: I
    if (event.keyCode === 73 && shiftOn) { terminal.cursor.toggleMode(1); this.setEditorMode('insert'); return }
    // key: i
    if (event.keyCode === 73) { this.setEditorMode('insert'); return }
    // key: r
    if (event.keyCode === 82) { this.setEditorMode('replace'); return }

  }

  this.insertModeKeyMapping = function (event) {
    const modifierOn = (event.metaKey || event.ctrlKey)
    const shiftOn = event.shiftKey

    // Reset
    if (modifierOn && event.key === 'Backspace') {
      terminal.reset()
      event.preventDefault()
      return
    }

    // Enter command mode if vim mode enabled
    if ((modifierOn && event.key === '[') || event.key === 'Escape') {
      terminal.cursor.reset()
      terminal.toggleGuide(false)
      terminal.commander.stop()
      terminal.isPaused = false
      event.preventDefault()

      // This causes a flicker so problematic to do every time escape
      // is pressed if using vim mode. Possibly need another key to clear
      if (!this.vimMode) { terminal.clear(); return }
      this.setEditorMode('command')
      return
    }

    // key: /
    if (event.keyCode === 191 && modifierOn) { terminal.cursor.comment(); event.preventDefault(); return }

    // Copy/Paste
    // key: c
    if (event.keyCode === 67 && modifierOn) { terminal.cursor.copy(); event.preventDefault(); return }
    // key: x
    if (event.keyCode === 88 && modifierOn) { terminal.cursor.cut(); event.preventDefault(); return }
    // key: v
    if (event.keyCode === 86 && modifierOn && shiftOn) { terminal.cursor.paste(true); event.preventDefault(); return }
    if (event.keyCode === 86 && modifierOn) { terminal.cursor.paste(false); event.preventDefault(); return }
    // key: a
    if (event.keyCode === 65 && modifierOn) { terminal.cursor.selectAll(); event.preventDefault(); return }

    // Undo/Redo
    // key: z
    if (event.keyCode === 90 && modifierOn && shiftOn) { terminal.history.redo(); event.preventDefault(); return }
    if (event.keyCode === 90 && modifierOn) { terminal.history.undo(); event.preventDefault(); return }

    // key: Up
    if (event.keyCode === 38) { this.onCursorUp(shiftOn, modifierOn, event.altKey); return }
    // key: Down
    if (event.keyCode === 40) { this.onCursorDown(shiftOn, modifierOn, event.altKey); return }
    // key: Left
    if (event.keyCode === 37) { this.onCursorLeft(shiftOn, modifierOn, event.altKey); return }
    // key: Right
    if (event.keyCode === 39) { this.onCursorRight(shiftOn, modifierOn, event.altKey); return }

    // key: Tab
    if (event.keyCode === 9) { terminal.toggleHardmode(); event.preventDefault(); return }

    if (modifierOn) { return }

    if (event.key === ' ' && terminal.cursor.mode === 0) { terminal.clock.togglePlay(); event.preventDefault(); return }
    if (event.key === ' ' && terminal.cursor.mode === 1) { terminal.cursor.move(1, 0); event.preventDefault(); return }

    if (event.key === 'Backspace') { terminal[this.isActive === true ? 'commander' : 'cursor'].erase(); event.preventDefault(); return }

    if (event.key === ']') { terminal.modGrid(1, 0); event.preventDefault(); return }
    if (event.key === '[') { terminal.modGrid(-1, 0); event.preventDefault(); return }
    if (event.key === '}') { terminal.modGrid(0, 1); event.preventDefault(); return }
    if (event.key === '{') { terminal.modGrid(0, -1); event.preventDefault(); return }
    if (event.key === '>') { terminal.clock.modSpeed(1); event.preventDefault(); return }
    if (event.key === '<') { terminal.clock.modSpeed(-1); event.preventDefault(); return }

    // Route key to Operator or Cursor
    terminal[this.isActive === true ? 'commander' : 'cursor'].write(event.key)
  }

  this.onKeyUp = function (event) {
    terminal.update()
  }

  this.onCursorUp = function (mod = false, skip = false, drag = false) {
    // Navigate History
    if (this.isActive === true) {
      this.historyIndex -= this.historyIndex > 0 ? 1 : 0
      this.start(this.history[this.historyIndex])
      return
    }
    const leap = skip ? terminal.grid.h : 1
    terminal.toggleGuide(false)
    if (drag) {
      terminal.cursor.drag(0, leap)
    } else if (mod) {
      terminal.cursor.scale(0, leap)
    } else {
      terminal.cursor.move(0, leap)
    }
  }

  this.onCursorDown = function (mod = false, skip = false, drag = false) {
    // Navigate History
    if (this.isActive === true) {
      this.historyIndex += this.historyIndex < this.history.length ? 1 : 0
      this.start(this.history[this.historyIndex])
      return
    }
    const leap = skip ? terminal.grid.h : 1
    terminal.toggleGuide(false)
    if (drag) {
      terminal.cursor.drag(0, -leap)
    } else if (mod) {
      terminal.cursor.scale(0, -leap)
    } else {
      terminal.cursor.move(0, -leap)
    }
  }

  this.onCursorLeft = function (mod = false, skip = false, drag = false) {
    const leap = skip ? terminal.grid.w : 1
    terminal.toggleGuide(false)
    if (drag) {
      terminal.cursor.drag(-leap, 0)
    } else if (mod) {
      terminal.cursor.scale(-leap, 0)
    } else {
      terminal.cursor.move(-leap, 0)
    }
  }

  this.onCursorRight = function (mod = false, skip = false, drag = false) {
    const leap = skip ? terminal.grid.w : 1
    terminal.toggleGuide(false)
    if (drag) {
      terminal.cursor.drag(leap, 0)
    } else if (mod) {
      terminal.cursor.scale(leap, 0)
    } else {
      terminal.cursor.move(leap, 0)
    }
  }

  // Events

  document.onkeydown = (event) => { this.onKeyDown(event) }
  document.onkeyup = (event) => { this.onKeyUp(event) }

  // UI

  this.toString = function () {
    return `${this.query}`
  }

  // Utils

  function clamp (v, min, max) { return v < min ? min : v > max ? max : v }
}
