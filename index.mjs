import {Gate, GateNode, ComputeContext, GateLink, GateInput, GateOutput, InputNode, OutputNode} from './logic.mjs';
import Vector from './node_modules/math/vector.js';
import Rectangle from './node_modules/math/rectangle.js';
import handyDOM from './handyDOM.mjs';
const GATE_PADDING = 30;
const IO_PADDING = 60;
const IO_SIZE = 10;
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let selectionRect = null;//new Rectangle();

const COLORS = {
  "io-off": "#212121",
  "io-on": "#fa3c3c",

}

const elements = handyDOM();

window.addEventListener('resize', handleResize, true)

function handleResize() {
  let rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  for (let input of globalIns) for (let output of input.outputs) output.move();
  for (let output of globalOuts) if (output.inputs[0]) output.inputs[0].move();
}

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
    for (let input of this.inputs) if (input) input.move();
    for (let output of this.outputs) if (output) output.move();
  }

  link(inIndex, node, outIndex) {
    if (this.inputs[inIndex]) this.inputs[inIndex].node.outputs.delete(this.inputs[inIndex]);
    this.inputs[inIndex] = new RenderingGateLink(this, inIndex, node, outIndex)
    node.outputs.add(this.inputs[inIndex]);
  }

  getOutputPos(i) {
    const middle = this.pos.y + this.size.h/2;
    let start = middle - (this.gate.outputs.length * GATE_PADDING)/2
    return new Vector(this.pos.x + this.size.w, start + GATE_PADDING/2 + i * GATE_PADDING);
  }

  getInputPos(i) {
    const middle = this.pos.y + this.size.h/2;
    let start = middle - (this.inputs.length * GATE_PADDING)/2
    return new Vector(this.pos.x, start + GATE_PADDING/2 + i * GATE_PADDING);
  }

  copy() {
    return new RenderingGate(this.gate, this.pos.copy());
  }
}

class RenderingInputNode extends InputNode {
  constructor(...args) {
    super(...args);
    this.outputs = new Set();
  }

  getOutputPos(i) {
    const middle = canvas.height/2;
    let start = middle - (globalIns.length * GATE_PADDING)/2
    return new Vector(IO_PADDING, start + GATE_PADDING/2 + this.index * GATE_PADDING);
  }
}

class RenderingOutputNode extends OutputNode {
  constructor(...args) {
    super(...args);
    this.outputs = new Set();
  }

  getInputPos(i) {
    const middle = canvas.height/2;
    let start = middle - (globalOuts.length * GATE_PADDING)/2
    return new Vector(canvas.width - IO_PADDING, start + GATE_PADDING/2 + this.index * GATE_PADDING);
  }
}

RenderingInputNode.prototype.link = RenderingGate.prototype.link;
RenderingOutputNode.prototype.link = RenderingGate.prototype.link;


class RenderingGateLink extends GateLink {
  constructor(to, inIndex, node, index) {
    super(node, index);
    this.to = to;
    this.inIndex = inIndex;
    this.start = new Vector();
    this.end = new Vector();
    this.points = [];
    this.move();
  }

  addPoint(point) {
    if (this.node && !this.to) {
      this.points.push(point.copy());
    } else if (!this.node && this.to) {
      this.points.unshift(point.copy());
    }
  }

  draw(computeContext) {
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

  move() {
    if (this.node) {
      this.start.set(this.node.getOutputPos(this.index));
    }
    if (this.to) {
      this.end.set(this.to.getInputPos(this.inIndex));
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
    this.gate.pos.set(mousePos).add(this.offset).clampX(IO_PADDING + 1, canvas.width - this.gate.size.w - (IO_PADDING + 1)).clampY(1 + GATE_PADDING/2, canvas.height - this.gate.size.h - 1 - GATE_PADDING/2);
    this.gate.move()
  }

  grab(mousePos) {
    this.offset.set(0, 0).add(this.gate.pos).sub(mousePos);
  }
}

function showOverlay(elem) {
  elem.classList.add('visible');
}

function closeOverlay(elem) {
  elem.classList.remove('visible');
}

const OrGate = new Gate("OR", ["A", "B"], ["X"], ([a, b])=>([a || b]), {'color': '#3c8bfa'});
const AndGate = new Gate("AND", ["A", "B"], ["X"], ([a, b])=>([a && b]), {'color': '#eb4034'});
const NotGate = new Gate("NOT", ["A"], ["X"], ([a])=>([!a]), {'color': '#faae3c'});
const XorGate = new Gate("XOR", ["A", "B"], ["X"], ([a, b])=>([(a || b) && !(a && b)]), {'color': '#8e3cfa'});

const gateTypes = new Map();

function addGate(gate) {
  gateTypes.set(gate.name, gate);
  let elem = document.createElement('button');
  elem.classList.add('gate-button');
  elem.addEventListener('click', ()=>{
    currentGates.add(new RenderingGate(gate, new Vector(canvas.width/2, canvas.height/2)))
  })
  elem.style.backgroundColor = gate.data.get('color');
  elem.innerText = gate.name;
  elements.gateList.append(elem)
}

addGate(OrGate);
addGate(NotGate);
addGate(AndGate);
addGate(XorGate);


let mousePos = new Vector();
let selection = new Set();
let dragging = false;
let currentLink = null;
let lastClickToggled = false;

elements.createGate.addEventListener('click', (e)=>{
  if (elements.gateName.value.length < 3) {
    console.error("Name must be larger than 3 characters.");
  } else {
    const gateName = elements.gateName.value;
    const gate = Gate.from(currentGates, globalIns, globalOuts, {color: elements.gateColor.value});
    currentGates.clear();
    globalIns.length = 0;
    globalOuts.length = 0;
    addGate(gate);
  }
})

canvas.addEventListener('contextmenu', e=>e.preventDefault())
canvas.addEventListener('mousedown', e=>{
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
        let pos = input.getOutputPos(input.index);
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
        let pos = output.getInputPos(output.index);
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
        selectionRect = new Rectangle(mousePos.copy())
      }
    }
  }
}, true)

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

const IO_INPUT = Symbol('IO_INPUT');
const IO_OUTPUT = Symbol('IO_OUTPUT');
const globalIns = [];
const globalOuts = [];
let IOAddType = null;
let IOPreConnect = null;
canvas.addEventListener('dblclick', e=>{
  mousePos.set(e.offsetX, e.offsetY);
  if (lastClickToggled) return;
  if (mousePos.x < IO_PADDING) {
    //Add input
    IOAddType = IO_INPUT;
    IOPreConnect = null;
    showOverlay(elements.newIODialog)
  } else if (mousePos.x > canvas.width - IO_PADDING) {
    //Add output
    IOAddType = IO_OUTPUT;
    IOPreConnect = null;
    showOverlay(elements.newIODialog)
  } else {
    IOAddType = null;
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
    }
    globalIns.push(input);
    closeOverlay(elements.newIODialog);
    for (let node of globalIns) for (let link of node.outputs) {
      link.move();
    }
  } else if (IOAddType == IO_OUTPUT) {
    const output = new RenderingOutputNode(elements.newIOName.value, globalOuts.length, [IOPreConnect]);
    globalOuts.push(output);
    if (IOPreConnect) {
      IOPreConnect.to = output;
      IOPreConnect.inIndex = 0;
    }
    closeOverlay(elements.newIODialog);
    for (let node of globalOuts) for (let link of node.inputs) {
      if (link) link.move();
    }
  } else {
    console.warn("Tried to add without proper type init.");
  }
}

canvas.addEventListener('mousemove', e=>{
  mousePos.set(e.offsetX, e.offsetY);
  if (dragging) {
    for (let sel of selection) {
      sel.move(mousePos);
    }
  }
  if (selectionRect) {
    selectionRect.size.set(Vector.sub(mousePos, selectionRect.pos));
  }
}, true)

canvas.addEventListener('mouseup', e=>{
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
            currentLink.move();
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
              currentLink.move();
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
          let pos = input.getOutputPos(i);
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
          let pos = output.getInputPos(i)
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
          } else if (mousePos.x > canvas.width - IO_PADDING) {
            IOAddType = IO_OUTPUT;
            IOPreConnect = currentLink;
            wasAction = true;
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
    } else if (selectionRect) {
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
      selectionRect = null;
    }
    dragging = false;
  } else if (e.button == 2) {
    if (currentLink) {
      currentLink.addPoint(mousePos);
    }
  }

}, true)


window.currentGates = new Set();
window.previousComputeContext = null;
window.currentComputeContext = new ComputeContext();

function recalculate() {
  previousComputeContext = currentComputeContext;
  currentComputeContext = new ComputeContext();
  for (let output of globalOuts) if (output.inputs[0] && output.inputs[0].node) output.inputs[0].node.compute(currentComputeContext, previousComputeContext);
  for (let gate of currentGates) gate.compute(currentComputeContext, previousComputeContext);
}

function draw() {
  const computeContext = currentComputeContext;
  ctx.fillStyle = "#3d3d3d";
  ctx.fillRect(0,0,canvas.width, canvas.height);
  ctx.strokeStyle = "#1d1d1d";
  ctx.lineWidth = 2;
  ctx.strokeRect(IO_PADDING, 1 + GATE_PADDING/2, canvas.width - 2 * IO_PADDING, canvas.height-2 - GATE_PADDING);
  for (let gate of currentGates) {
    ctx.fillStyle = gate.gate.data.get('color');
    ctx.fillRect(gate.pos.x, gate.pos.y, gate.size.w, gate.size.h);
    const middle = Vector.mult(gate.size, .5).add(gate.pos);

    // let middle = gate.pos.y  + gate.size.h/2;
    let startIn = middle.y - (gate.inputs.length * GATE_PADDING)/2
    let startOut = middle.y - (gate.gate.outputs.length * GATE_PADDING)/2
    for (let [i, input] of gate.inputs.entries()) {
      ctx.fillStyle = COLORS['io-' + (input&&input.node&&computeContext.cached.has(input.node)&&computeContext.cached.get(input.node).outputs[input.index]?'on':'off')];
      if (input) input.draw(computeContext)
      ctx.beginPath()
      ctx.arc(gate.pos.x, startIn + GATE_PADDING/2 + i * GATE_PADDING, IO_SIZE, 0, 2 * Math.PI);
      ctx.fill()
    }
    for (let [i, output] of gate.gate.outputs.entries()) {
      ctx.fillStyle = COLORS['io-' + (computeContext.cached.has(gate)&&computeContext.cached.get(gate).outputs[i]?'on':'off')];
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
    let rect = gate.interactRect;
    if (rect.intersect(mousePos)) {
      ctx.fillStyle = '#d4d4d433';
      ctx.fillRect(rect.pos.x , rect.pos.y , rect.size.w, rect.size.h)
    }
  }
  let globalStartIns = canvas.height/2 - GATE_PADDING * (globalIns.length/2);
  let globalStartOuts = canvas.height/2 - GATE_PADDING * (globalOuts.length/2);
  for (let [i, input] of globalIns.entries()) {
    let pos = input.getOutputPos(input.index);
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
  for (let [i, output] of globalOuts.entries()) {
    ctx.fillStyle = COLORS['io-' + (output.inputs[0]&&output.inputs[0].node&&computeContext.cached.has(output.inputs[0].node)&&computeContext.cached.get(output.inputs[0].node).outputs[output.inputs[0].index]?'on':'off')];
    ctx.beginPath()
    ctx.arc(canvas.width - IO_PADDING, globalStartOuts + GATE_PADDING/2 + i * GATE_PADDING, IO_SIZE, 0, 2 * Math.PI);
    ctx.fill()
    if (output.inputs[0]) output.inputs[0].draw(computeContext)
  }
  if (currentLink && !currentLink.to) {
    currentLink.draw(computeContext);
  }
  for (let sel of selection) {
    ctx.strokeStyle = '#888888';
    let rect = sel.gate.interactRect;
    ctx.strokeRect(rect.pos.x, rect.pos.y, rect.size.w, rect.size.h)
  }
  if (selectionRect) {
    ctx.fillStyle = '#88888833';
    ctx.strokeStyle = '#888888';
    ctx.beginPath();
    ctx.rect(selectionRect.pos.x, selectionRect.pos.y, selectionRect.size.w, selectionRect.size.h);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = 'lime';
  ctx.beginPath()
  ctx.arc(mousePos.x, mousePos.y, 5, 0, 2 * Math.PI);
  ctx.fill()
  requestAnimationFrame(draw)
}
handleResize();
requestAnimationFrame(draw)
const gate1 = new RenderingGate(AndGate, new Vector(200, 200));
const gate2 = new RenderingGate(OrGate, new Vector(200, 600));
gate1.link(0, gate2, 0);
currentGates.add(gate1);
currentGates.add(gate2)
currentGates.add(new RenderingGate(OrGate, new Vector(400, 600)));
currentGates.add(new RenderingGate(NotGate, new Vector(430, 600)));
currentGates.add(new RenderingGate(NotGate, new Vector(460, 600)));
currentGates.add(new RenderingGate(NotGate, new Vector(490, 600)));

setInterval(recalculate, 1000/20);

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
