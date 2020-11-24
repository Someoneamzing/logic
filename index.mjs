import {Gate, GateNode, ComputeContext, GateLink, GateInput, GateOutput, InputNode, OutputNode} from './logic.mjs';
import Vector from './node_modules/math/vector.js';
import Rectangle from './node_modules/math/rectangle.js';
import handyDOM from './handyDOM.mjs';
import {fs} from './node_modules.js';


const GATE_PADDING = 30;
const IO_PADDING = 60;
const IO_SIZE = 10;
const COLORS = {
  "io-off": "#212121",
  "io-on": "#fa3c3c",

}

const elements = handyDOM();
// const canvas = document.getElementById('canvas');
// const ctx = canvas.getContext('2d');
// const internalsCanvas = document.createElement('canvas');
// const internalsCtx = internalsCanvas.getContext('2d');

const IO_INPUT = Symbol('IO_INPUT');
const IO_OUTPUT = Symbol('IO_OUTPUT');
const gateTypes = new Map();
const globalIns = [];
const globalOuts = [];


let mousePos = new Vector();
let selection = new Set();
let IOAddType = null;
let IOPreConnect = null;
let selectionRect = new Rectangle();
selectionRect.active = false;
let dragging = false;
let currentLink = null;
let lastClickToggled = false;

class Compositor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layers = [];
  }

  draw(context, prevContext) {
    for (let layer of this.layers) layer(this.ctx, context, prevContext);
  }
}

const comp = new Compositor(elements.canvas);


class RenderingGate extends GateNode {
  constructor(gate, pos) {
    super(gate, gate.inputs.map(_=>null))
    this.outputs = new Set();
    this.pos = pos;
    this.size = new Vector(80,  GATE_PADDING * gate.inputs.length);
  }

  get interactRect() {
    return new Rectangle(Vector.sub(this.pos, 10, 10), Vector.add(this.size, 20, 20));
  }

  get selected() {
    for (let sel of selection) if (sel.gate == this) return sel;
    return false;
  }

  move() {
    for (let input of this.inputs) if (input) input.move(elements.canvas);
    for (let output of this.outputs) if (output) output.move(elements.canvas);
  }

  link(inIndex, node, outIndex) {
    if (this.inputs[inIndex]) this.inputs[inIndex].node.outputs.delete(this.inputs[inIndex]);
    this.inputs[inIndex] = new RenderingGateLink(this, inIndex, node, outIndex)
    node.outputs.add(this.inputs[inIndex]);
  }

  getOutputPos(canvas, i) {
    const middle = this.pos.y + this.size.h/2;
    let start = middle - (this.gate.outputs.length * GATE_PADDING)/2
    return new Vector(this.pos.x + this.size.w, start + GATE_PADDING/2 + i * GATE_PADDING);
  }

  getInputPos(canvas, i) {
    const middle = this.pos.y + this.size.h/2;
    let start = middle - (this.inputs.length * GATE_PADDING)/2
    return new Vector(this.pos.x, start + GATE_PADDING/2 + i * GATE_PADDING);
  }

  copy() {
    return new RenderingGate(this.gate, this.pos.copy());
  }

  serialise() {
    return {pos: this.pos, ...super.serialise()}
  }
}

class RenderingInputNode extends InputNode {
  constructor(...args) {
    super(...args);
    this.outputs = new Set();
  }

  getOutputPos(canvas, i) {
    const middle = canvas.height/2;
    let start = middle - (globalIns.length * GATE_PADDING)/2
    return new Vector(IO_PADDING, start + GATE_PADDING/2 + this.index * GATE_PADDING);
  }

  copy() {
    return new RenderingInputNode(this.name, this.index)
  }
}

class RenderingOutputNode extends OutputNode {
  constructor(...args) {
    super(...args);
    this.outputs = new Set();
  }

  getInputPos(canvas, i) {
    const middle = canvas.height/2;
    let start = middle - (globalOuts.length * GATE_PADDING)/2
    return new Vector(canvas.width - IO_PADDING, start + GATE_PADDING/2 + this.index * GATE_PADDING);
  }

  copy() {
    return new RenderingOutputNode(this.name, this.index, [null])
  }
}

class RenderingGateLink extends GateLink {
  constructor(to, inIndex, node, index) {
    super(node, index);
    this.to = to;
    this.inIndex = inIndex;
    this.start = new Vector();
    this.end = new Vector();
    this.points = [];
    this.move(elements.canvas);
  }

  addPoint(point) {
    if (this.node && !this.to) {
      this.points.push(point.copy());
    } else if (!this.node && this.to) {
      this.points.unshift(point.copy());
    }
  }

  draw(ctx, computeContext) {
    ctx.strokeStyle = COLORS['io-' + (this.node&&computeContext.cached.has(this.node)&&computeContext.cached.get(this.node).outputs[this.index]?'on':'off')];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.start.x, this.start.y);
    for (let [i, point] of this.points.entries()) {
      let next = i < this.points.length-1?this.points[i + 1]:this.end;
      ctx.arcTo(point.x, point.y, next.x, next.y, 25)
    }
    ctx.lineTo(this.end.x, this.end.y);
    ctx.stroke();
  }

  move(canvas) {
    if (this.node) {
      this.start.set(this.node.getOutputPos(canvas, this.index));
    }
    if (this.to) {
      this.end.set(this.to.getInputPos(canvas, this.inIndex));
    }
  }

  copy() {
    let res = new RenderingGateLink(this.to, this.inIndex, this.node, this.index);
    for (let point of this.points) res.addPoint(point);
    return res;
  }
}

class Selection {
  constructor(gate, initialMousePos) {
    this.gate = gate;
    this.offset = new Vector();
    this.grab(initialMousePos);
  }

  move(mousePos) {
    this.gate.pos.set(mousePos).add(this.offset).clampX(IO_PADDING + 1, elements.canvas.width - this.gate.size.w - (IO_PADDING + 1)).clampY(1 + GATE_PADDING/2, elements.canvas.height - this.gate.size.h - 1 - GATE_PADDING/2);
    this.gate.move(elements.canvas)
  }

  grab(mousePos) {
    this.offset.set(0, 0).add(this.gate.pos).sub(mousePos);
  }
}

RenderingInputNode.prototype.link = RenderingGate.prototype.link;
RenderingOutputNode.prototype.link = RenderingGate.prototype.link;


//DOM Manipulation / Management
function handleResize() {
  let rect = canvas.getBoundingClientRect();
  elements.canvas.width = rect.width;
  elements.canvas.height = rect.height;
  for (let input of globalIns) for (let output of input.outputs) output.move(elements.canvas);
  for (let output of globalOuts) if (output.inputs[0]) output.inputs[0].move(elements.canvas);
}

function showOverlay(elem) {
  elem.classList.add('visible');
  let firstInput = elem.querySelector("input[focus]");
  if (firstInput) {
    firstInput.value = ""
    firstInput.focus()
  }
}

function closeOverlay(elem) {
  elem.classList.remove('visible');
}

const OrGate = new Gate("OR", ["A", "B"], ["X"], ([a, b])=>([a || b]), {'color': '#3c8bfa'});
const AndGate = new Gate("AND", ["A", "B"], ["X"], ([a, b])=>([a && b]), {'color': '#eb4034'});
const NotGate = new Gate("NOT", ["A"], ["X"], ([a])=>([!a]), {'color': '#faae3c'});
const XorGate = new Gate("XOR", ["A", "B"], ["X"], ([a, b])=>([(a || b) && !(a && b)]), {'color': '#8e3cfa'});


function addGate(gate) {
  gateTypes.set(gate.name, gate);
  if (gate.data.has('CIC')) {
    let internals = gate.data.get('internals');
    gate.data.set('CIC-layers', [
      createBackgroundLayer(),
      createGateLayer(internals.gates),
      createIOLayer(internals.inputs, internals.outputs),
      createLinkLayer(internals.gates, internals.inputs, internals.outputs),
    ])
  }
  let elem = document.createElement('button');
  elem.classList.add('gate-button');
  elem.addEventListener('click', ()=>{
    currentGates.add(new RenderingGate(gate, new Vector(elements.canvas.width/2, elements.canvas.height/2)))
  })
  elem.style.backgroundColor = gate.data.get('color');
  elem.innerText = gate.name;
  elements.gateList.append(elem)
}

addGate(OrGate);
addGate(NotGate);
addGate(AndGate);
addGate(XorGate);
function handleColorChange(e){
  elements.gateColorWrapper.style.backgroundColor = elements.gateColor.value;
}
elements.gateColor.addEventListener('input', handleColorChange, true)
handleColorChange()
window.addEventListener('resize', handleResize, true)
canvas.addEventListener('contextmenu', e=>e.preventDefault())

elements.createGate.addEventListener('click', (e)=>{
  if (elements.gateName.value.length < 3) {
    console.error("Name must be larger than 3 characters.");
  } else {
    const gateName = elements.gateName.value;
    const gate = Gate.from(gateName, globalIns, globalOuts, {color: elements.gateColor.value});
    currentGates.clear();
    globalIns.length = 0;
    globalOuts.length = 0;
    addGate(gate);
  }
})

window.addEventListener('keydown', (e)=>{
  console.log(e);
  if (e.key == 'Delete') {
    for (let sel of selection) {
      for (let input of sel.gate.inputs) if (input) input.node.outputs.delete(input);
      for (let output of sel.gate.outputs) output.to.inputs[output.inIndex] = null;
      currentGates.delete(sel.gate);
    }
    selection.clear();
  }
})

elements.newIOForm.onsubmit = (e) =>{
  e.preventDefault();
  if (IOAddType == IO_INPUT) {
    const input = new RenderingInputNode(elements.newIOName.value, globalIns.length);
    if (IOPreConnect)  {
      input.outputs.add(IOPreConnect)
      IOPreConnect.node = input;
      IOPreConnect.index = 0;
      IOPreConnect.start = new Vector();
    }
    globalIns.push(input);
    closeOverlay(elements.newIODialog);
    for (let node of globalIns) for (let link of node.outputs) {
      link.move(elements.canvas);
    }
  } else if (IOAddType == IO_OUTPUT) {
    const output = new RenderingOutputNode(elements.newIOName.value, globalOuts.length, [IOPreConnect]);
    globalOuts.push(output);
    if (IOPreConnect) {
      IOPreConnect.to = output;
      IOPreConnect.inIndex = 0;
      IOPreConnect.end = new Vector();
    }
    closeOverlay(elements.newIODialog);
    for (let node of globalOuts) for (let link of node.inputs) {
      if (link) link.move(elements.canvas);
    }
  } else {
    console.warn("Tried to add without proper type init.");
  }
}

elements.newIOName.onblur = (e) =>{
  closeOverlay(elements.newIODialog)
  IOPreConnect = null;
  IOAddType = null;
}

elements.canvas.addEventListener('mousedown', e=>{
  mousePos.set(e.offsetX, e.offsetY);
  if (e.button == 0) {
    lastClickToggled = false;
    let lastSel = null;
    for (let gate of currentGates) {
      let rect = gate.interactRect;
      if (rect.intersect(mousePos)) {
        lastSel = gate;
      }
    }
    if (lastSel) {
      let wasAction = false;
      const middle = Vector.mult(lastSel.size, .5).add(lastSel.pos);

      // let middle = gate.pos.y  + gate.size.h/2;
      let startIn = middle.y - (lastSel.inputs.length * GATE_PADDING)/2;
      let startOut = middle.y - (lastSel.gate.outputs.length * GATE_PADDING)/2;
      for (let [i, input] of lastSel.inputs.entries()) {
        let pos = new Vector(lastSel.pos.x, startIn + GATE_PADDING/2 + i * GATE_PADDING)
        if (pos.distance2(mousePos) < IO_SIZE ** 2) {
          if (input) input.node.outputs.delete(input);
          currentLink = new RenderingGateLink(lastSel, i, null, 0);
          currentLink.start = mousePos;
          lastSel.inputs[i] = currentLink;
          wasAction = true;
          break;
        }
      }
      if (!wasAction) {
        for (let [i, output] of lastSel.gate.outputs.entries()) {
          let pos = new Vector(lastSel.pos.x + lastSel.size.w, startOut + GATE_PADDING/2 + i * GATE_PADDING)
          if (pos.distance2(mousePos) < IO_SIZE ** 2) {
            console.log(startIn, startOut);

            currentLink = new RenderingGateLink(null, 0, lastSel, i);
            currentLink.end = mousePos;
            lastSel.outputs.add(currentLink);
            wasAction = true;
            break;
          }
        }
      }
      if (!wasAction) {
        let sel = lastSel.selected;
        if (sel) {
          dragging = true;
          for (let sel of selection) {
            sel.grab(mousePos);
          }
        } else {
          if (!(e.getModifierState('Control') || e.getModifierState('Shift'))) {
            selection.clear();
          } else for (let sel of selection) sel.grab(mousePos);
          selection.add(new Selection(lastSel, mousePos))
          dragging = true;
        }
      }
    } else {
      let wasAction = false;
      for (let input of globalIns) {
        let pos = input.getOutputPos(elements.canvas, input.index);
        if (pos.distance2(mousePos) < IO_SIZE ** 2) {
          currentLink = new RenderingGateLink(null, 0, input, 0);
          currentLink.end = mousePos;
          input.outputs.add(currentLink);
          wasAction = true;
          break;
        }
        if (!wasAction) {
          let clickPos = Vector.sub(pos, IO_PADDING/2, 0);
          if (clickPos.distance2(mousePos) < (IO_SIZE * 1.5) ** 2) {
            input.toggle();
            wasAction = true;
            lastClickToggled = true;
            recalculate();
            break;
          }
        }
      }

      if (!wasAction) for (let output of globalOuts) {
        let pos = output.getInputPos(elements.canvas, output.index);
        if (pos.distance2(mousePos) < IO_SIZE ** 2) {
          if (output.inputs[0]) output.inputs[0].node.outputs.delete(output.inputs[0]);
          currentLink = new RenderingGateLink(output, 0, null, 0);
          currentLink.start = mousePos;
          output.inputs[0] = currentLink;
          wasAction = true;
          break;
        }
      }

      if (!wasAction) {
        selectionRect.pos.set(mousePos)
        selectionRect.size.set(0,0)
        selectionRect.active = true;
      }
    }
  }
}, true)

elements.canvas.addEventListener('mousemove', e=>{
  mousePos.set(e.offsetX, e.offsetY);
  if (dragging) {
    for (let sel of selection) {
      sel.move(mousePos);
    }
  }
  if (selectionRect.active) {
    selectionRect.size.set(Vector.sub(mousePos, selectionRect.pos));
  }
}, true)

elements.canvas.addEventListener('mouseup', e=>{
  mousePos.set(e.offsetX, e.offsetY);
  if (e.button == 0) {
    if (currentLink){
      let lastSel = null;
      for (let gate of currentGates) {
        let rect = gate.interactRect;
        if (rect.intersect(mousePos)) {
          lastSel = gate;
        }
      }
      if (lastSel) {
        let wasAction = false;
        const middle = Vector.mult(lastSel.size, .5).add(lastSel.pos);

        // let middle = gate.pos.y  + gate.size.h/2;
        let startIn = middle.y - (lastSel.inputs.length * GATE_PADDING)/2;
        let startOut = middle.y - (lastSel.gate.outputs.length * GATE_PADDING)/2;
        console.log(startIn, startOut);
        for (let [i, input] of lastSel.inputs.entries()) {
          let pos = new Vector(lastSel.pos.x, startIn + GATE_PADDING/2 + i * GATE_PADDING)
          if (pos.distance2(mousePos) < IO_SIZE ** 2) {
            if (input) {
              lastSel.inputs[i] = null;
              input.node.outputs.delete(input);
            }
            currentLink.to = lastSel;
            currentLink.inIndex = i;
            currentLink.end = new Vector();
            currentLink.move(elements.canvas);
            lastSel.inputs[i] = currentLink;
            currentLink = null;
            wasAction = true;
            break;
          }
        }
        if (!wasAction) {
          for (let [i, output] of lastSel.gate.outputs.entries()) {
            let pos = new Vector(lastSel.pos.x + lastSel.size.w, startOut + GATE_PADDING/2 + i * GATE_PADDING)
            if (pos.distance2(mousePos) < IO_SIZE ** 2) {
              currentLink.node = lastSel;
              currentLink.index = i;
              currentLink.start = new Vector();
              currentLink.move(elements.canvas);
              lastSel.outputs.add(currentLink);
              currentLink = null;
              wasAction = true;
              break;
            }
          }
        }
      } else {
        let wasAction = false;
        for (let [i, input] of globalIns.entries()) {
          let pos = input.getOutputPos(elements.canvas, i);
          if (pos.distance2(mousePos) < IO_SIZE ** 2) {
            currentLink.node = input;
            currentLink.start = new Vector(pos);
            currentLink.index = 0;
            input.outputs.add(currentLink);
            wasAction = true;
            break;
          }
        }
        if (!wasAction) for (let [i, output] of globalOuts.entries()) {
          let pos = output.getInputPos(elements.canvas, i)
          if (pos.distance2(mousePos) < IO_SIZE ** 2) {
            if (output.inputs[0]) {
              output.inputs[0].node.outputs.delete(output.inputs[0]);
              output.inputs[0] = null;
            }
            currentLink.to = output;
            currentLink.end = new Vector(pos);
            currentLink.inIndex = 0;
            output.inputs[0] = currentLink;
            wasAction = true;
            break;
          }
        }
        if (!wasAction) {
          if (mousePos.x < IO_PADDING) {
            IOAddType = IO_INPUT;
            IOPreConnect = currentLink;
            wasAction = true;
            showOverlay(elements.newIODialog)
          } else if (mousePos.x > elements.canvas.width - IO_PADDING) {
            IOAddType = IO_OUTPUT;
            IOPreConnect = currentLink;
            wasAction = true;
            showOverlay(elements.newIODialog)
          } else {
            if (currentLink.node) {
              currentLink.node.outputs.delete(currentLink);
            }
            if (currentLink.to) {
              currentLink.to.inputs[currentLink.inIndex] = null;
            }
          }
        }
        currentLink = null;

      }
    } else if (selectionRect.active) {
      if (e.getModifierState('Control') || e.getModifierState('Shift')) {
        for (let gate of currentGates) {
          if (selectionRect.intersect(gate.interactRect)) selection.add(new Selection(gate, mousePos))
        }
      } else {
        selection.clear();
        for (let gate of currentGates) {
          if (selectionRect.intersect(gate.interactRect)) selection.add(new Selection(gate, mousePos))
        }
      }
      selectionRect.active = false;
      selectionRect.size.set(0,0);
    }
    dragging = false;
  } else if (e.button == 2) {
    if (currentLink) {
      currentLink.addPoint(mousePos);
    }
  }

}, true)

elements.canvas.addEventListener('dblclick', e=>{
  mousePos.set(e.offsetX, e.offsetY);
  if (lastClickToggled) return;
  if (mousePos.x < IO_PADDING) {
    //Add input
    IOAddType = IO_INPUT;
    IOPreConnect = null;
    showOverlay(elements.newIODialog)
  } else if (mousePos.x > elements.canvas.width - IO_PADDING) {
    //Add output
    IOAddType = IO_OUTPUT;
    IOPreConnect = null;
    showOverlay(elements.newIODialog)
  } else {
    IOAddType = null;
  }
})

window.currentGates = new Set();
window.previousComputeContext = null;
window.currentComputeContext = new ComputeContext();

//Simulation and Drawing Functions

function recalculate() {
  previousComputeContext = currentComputeContext;
  currentComputeContext = new ComputeContext();
  for (let output of globalOuts) if (output.inputs[0] && output.inputs[0].node) output.inputs[0].node.compute(currentComputeContext, previousComputeContext);
  for (let gate of currentGates) gate.compute(currentComputeContext, previousComputeContext);
}

function createLinkLayer(gates, inputs, outputs) {
  return function (ctx, computeContext, prevContext) {
    for (let gate of gates) {
      for (let input of gate.inputs) {
        if (input) input.draw(ctx, computeContext)
      }
    }
    for (let output of outputs) if (output.inputs[0]) output.inputs[0].draw(ctx, computeContext);
    if (currentLink && !currentLink.to) {
      currentLink.draw(ctx, computeContext);
    }
  }
}

function createCircuitInCircuitLayer(gates, selection) {
  const buffer = document.createElement('canvas');
  buffer.width = 800;
  buffer.height = 600;
  const compositor = new Compositor(buffer);
  return function(ctx,context,prevContext) {
    if (selection.size == 1) {
      let gate = [...selection][0].gate;
      if (gate.gate.data.has('CIC')) {
        compositor.layers.length = 0;
        compositor.layers.push(...gate.gate.data.get('CIC-layers'))
        compositor.draw(context.subContexts.get(gate), prevContext.subContexts.get(gate))
        const middle = Vector.mult(gate.size, 0.5).add(gate.pos);

        ctx.drawImage(buffer, 0, 0, buffer.width, buffer.height, middle.x - buffer.width/4, gate.pos.y - buffer.height/2 - GATE_PADDING, buffer.width/2, buffer.height/2)
      }
    }
  }
}

function createSelectionLayer(gates, selection, selectionRect) {
  return function(ctx) {
    for (let sel of selection) {
      ctx.strokeStyle = '#888888';
      let rect = sel.gate.interactRect;
      ctx.strokeRect(rect.pos.x, rect.pos.y, rect.size.w, rect.size.h)
    }
    if (selectionRect.active) {
      ctx.fillStyle = '#88888833';
      ctx.strokeStyle = '#888888';
      ctx.beginPath();
      ctx.rect(selectionRect.pos.x, selectionRect.pos.y, selectionRect.size.w, selectionRect.size.h);
      ctx.fill();
      ctx.stroke();
    } else {
      for (let gate of gates) {
        let rect = gate.interactRect;
        if (rect.intersect(mousePos)) {
          ctx.fillStyle = '#d4d4d433';
          ctx.fillRect(rect.pos.x , rect.pos.y , rect.size.w, rect.size.h)
        }
      }
    }
  }
}

function createIOLayer(inputs, outputs) {
  return function (ctx, computeContext, prevContext) {
    let globalStartIns = ctx.canvas.height/2 - GATE_PADDING * (inputs.length/2);
    let globalStartOuts = ctx.canvas.height/2 - GATE_PADDING * (outputs.length/2);
    for (let [i, input] of inputs.entries()) {
      let pos = input.getOutputPos(ctx.canvas, input.index);
      ctx.fillStyle = ctx.strokeStyle = COLORS['io-' + (input.state?'on':'off')];
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, IO_SIZE, 0, 2 * Math.PI);
      ctx.moveTo(IO_PADDING/2, pos.y);
      ctx.arc(IO_PADDING/2, pos.y, 1.5 * IO_SIZE, 0, 2 * Math.PI);
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(IO_PADDING/2, pos.y);
      ctx.stroke();

    }
    for (let [i, output] of outputs.entries()) {
      ctx.fillStyle = COLORS['io-' + (computeContext.getLinkState(output.inputs[0])?'on':'off')];
      ctx.beginPath()
      ctx.arc(ctx.canvas.width - IO_PADDING, globalStartOuts + GATE_PADDING/2 + i * GATE_PADDING, IO_SIZE, 0, 2 * Math.PI);
      ctx.fill()
    }
  }
}

function createGateLayer(gates) {
  return function(ctx, computeContext, prevContext) {
    for (let gate of gates) {
      //Fill gate's rect.
      ctx.fillStyle = gate.gate.data.get('color');
      ctx.fillRect(gate.pos.x, gate.pos.y, gate.size.w, gate.size.h);

      const middle = Vector.mult(gate.size, .5).add(gate.pos);
      let startIn = middle.y - (gate.inputs.length * GATE_PADDING)/2;
      let startOut = middle.y - (gate.gate.outputs.length * GATE_PADDING)/2;


      for (let [i, input] of gate.inputs.entries()) {
        ctx.fillStyle = COLORS['io-' + (computeContext.getLinkState(input)?'on':'off')];
        ctx.beginPath()
        ctx.arc(gate.pos.x, startIn + GATE_PADDING/2 + i * GATE_PADDING, IO_SIZE, 0, 2 * Math.PI);
        ctx.fill()
      }
      for (let [i, output] of gate.gate.outputs.entries()) {
        ctx.fillStyle = COLORS['io-' + (computeContext.getLinkState({node: gate, index: i})?'on':'off')];
        ctx.beginPath()
        ctx.arc(gate.pos.x + gate.size.w, startOut + GATE_PADDING/2 + i * GATE_PADDING, IO_SIZE, 0, 2 * Math.PI);
        ctx.fill()
      }
      // for (let output of gate.outputs) output.draw();
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = "1.5rem Arial";
      ctx.fillText(gate.gate.name, middle.x, middle.y)

    }
  }
}

function createBackgroundLayer() {
  return function(ctx) {
    ctx.fillStyle = "#3d3d3d";
    ctx.fillRect(0,0,ctx.canvas.width, ctx.canvas.height);
    ctx.strokeStyle = "#1d1d1d";
    ctx.lineWidth = 2;
    ctx.strokeRect(IO_PADDING, 1 + GATE_PADDING/2, ctx.canvas.width - 2 * IO_PADDING, ctx.canvas.height-2 - GATE_PADDING);
  }
}

comp.layers.push(createBackgroundLayer())
comp.layers.push(createGateLayer(currentGates))
comp.layers.push(createIOLayer( globalIns, globalOuts))
comp.layers.push(createLinkLayer(currentGates, globalIns, globalOuts))
comp.layers.push(createSelectionLayer(currentGates, selection, selectionRect))
comp.layers.push(createCircuitInCircuitLayer(currentGates, selection))

function draw() {

  comp.draw(currentComputeContext, previousComputeContext)

  requestAnimationFrame(draw)
}

handleResize();
requestAnimationFrame(draw);

async function loadProject() {
  let project = JSON.parse(await fs.readFile('./project.json', 'utf-8'))
  for (let gateDef of project.made) {
    let usedGates = new Set();
    let gates = gateDef.gates.map(({gate, pos})=>{
      usedGates.add(gateTypes.get(gate));
      return new RenderingGate(gateTypes.get(gate), new Vector(pos[0], pos[1], pos[2]))
    })
    let inputs = gateDef.inputs.map(({name}, i)=>new RenderingInputNode(name, i))
    let outputs = gateDef.outputs.map(({name}, i)=>new RenderingOutputNode(name, i, [null]))
    for (let link of gateDef.links) {
      let node = link.node !== null?gates[link.node]:inputs[link.index];
      let index = link.node !== null?link.index:0;
      if (link.to === null) {
        outputs[link.inIndex].link(0, node, index)
      } else {
        gates[link.to].link(link.inIndex, node, index)
      }
    }
    addGate(gateDef.data.CIC?new Gate(gateDef.name, inputs.map(input=>input.name), outputs.map(output=>output.name), Gate.createGateMapper(gates, inputs, outputs), {...gateDef.data, internals: {gates, inputs, outputs}, dependencies: usedGates, CIC: true}):Gate.from(gateDef.name, inputs, outputs, gateDef.data))
  }
  let current = project.current;
  elements.gateName.value = current.name;
  elements.gateColor.value = current.data.color;
  globalIns.length = 0;
  globalOuts.length = 0;
  currentGates.clear();
  globalIns.push(...current.inputs.map(io=>new RenderingInputNode(io.name, io.index)));
  globalOuts.push(...current.outputs.map(io=>new RenderingOutputNode(io.name, io.index, [null])));
  let indexMap = [];
  for (let gate of current.gates) {
    let node = new RenderingGate(gateTypes.get(gate), new Vector(...pos));
    currentGates.add(node);
    indexMap.push(node);
  }
  for (let link of current.links) {
    let node = link.node !== null?indexMap[link.node]:inputs[link.index];
    let index = link.node !== null?link.index:0;
    if (link.to === null) {
      outputs[link.inIndex].link(0, node, index)
    } else {
      indexMap[link.to].link(link.inIndex, node, index)
    }
  }
}

function getAllLinks(gates, outputs) {
  let links = new Set();
  for (let gate of gates) for (let input of gate.inputs) if (input) links.add(input)
  for (let output of outputs) if (output.inputs[0]) links.add(output.inputs[0])
  return links;
}

async function saveProject() {
  let gates = [...gateTypes.values()].sort((a, b)=>{
    if (a.data.has('dependencies')&&a.data.get('dependencies').has(b)) {
      return 1
    } else if (b.data.has('dependencies')&&b.data.get('dependencies').has(a)) {
      return -1
    } else return 0;
  });
  let currentGateList = [...currentGates];
  const linkSerialise = gateList => link=>{
    let node, index, to, inIndex;
    if (link.node instanceof InputNode || link.node instanceof OutputNode) {
      node = null;
      index = link.node.index;
    } else {
      node = gateList.indexOf(link.node);
      index = link.index;
    }

    if (link.to instanceof InputNode || link.to instanceof OutputNode) {
      to = null;
      inIndex = link.to.index;
    } else {
      to = gateList.indexOf(link.to);
      inIndex = link.inIndex;
    }
    return { node, index, to, inIndex, points: link.points }
  }
  const serialiseData = (out, [key, value])=>{
    if (typeof value !== 'object') out[key] = value;
    return out
  }
  let res = {
    made: gates.filter(gate=>gate.data.has('internals')).map(gate=>({
      name: gate.name,
      gates: [...gate.data.get('internals').gates].map(node=>(node.serialise())),
      links: [...getAllLinks(gate.data.get('internals').gates, gate.data.get('internals').outputs)].map(linkSerialise([...gate.data.get('internals').gates])),
      inputs: [...gate.data.get('internals').inputs].map(io=>io.serialise()),
      outputs: [...gate.data.get('internals').outputs].map(io=>io.serialise()),
      data: [...gate.data.entries()].reduce(serialiseData, {})
    })),
    current: {
      name: elements.gateName.value,
      gates: currentGateList.map(gate=>gate.serialise()),
      links: [...getAllLinks(currentGates, globalOuts)].map(linkSerialise(currentGateList)),
      inputs: globalIns.map(io=>io.serialise()),
      outputs: globalOuts.map(io=>io.serialise()),
      data: {color: elements.gateColor.value}
    }
  }
  console.log(res);
  await fs.writeFile('./project.json', JSON.stringify(res))
}

window.REPL = {
  saveProject,
  loadProject
}

setInterval(recalculate, 1000/20);

loadProject();

elements.save.onclick = saveProject

/* TODO:
  [x] Gate Links with rounded corners (kinda done, need to implement splitting and control points to test.)
      [ ] Interaction and splitting
      [x] HI/LO state
  [ ] Global IO points.
      [x] Connecting
      [x] Adding
      [x] Toggling
      [ ] Showing Names
      [ ] Grouping - Bin - Dec disp.
  [ ] Adding gates from list.
  [ ] Saving gates.
  [x] Simulation
      [x] Previous gate state.
      [x] State Updates.

Test the clone algorithm to make sure it works.
*/
