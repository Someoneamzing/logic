
function toBin(a) {
  return a.toString(2).padStart(8, '0')
}
class Stack {
  constructor(){
    this.stack = [];
    this.deduper = new Set()
  }

  push(e) {
    if (this.deduper.has(e)) return false;
    this.deduper.add(e);
    this.stack.push(e);
    return true;
  }

  pop() {
    let e = this.stack.pop();
    this.deduper.delete(e);
    return e;
  }

  has(e) {
    return this.deduper.has(e);
  }

  get size() {return this.deduper.size}
}

export class Gate {
  constructor(name, inputs, outputs, mapper, data = {}) {
    this.inputs = inputs;
    this.outputs = outputs;
    this.mapper = mapper;
    this.name = name;
    this.data = new Map(Object.entries(data))
  }

  compute(inputs) {
    return this.mapper(inputs);
  }

  static IOSorter(a, b) {return a.index - b.index};

  static graphGate(name, inputs, outputs, data) {
    let gates = new Set();
    function walk(gate) {
      gates.add(gate);
      for (let input of gate.inputs) {
        if (input && input.node) {
          if (!gates.has(input.node)) {
            walk(input.node);
          }
        }
      }
    }
    for (let output of outputs) {
      walk(output);
    }
    let clones = GateNode.clone(gates, true);
    return new Gate(name, inputs.map(input=>input.name), outputs.map(output=>output.name), Gate.createGateMapper(clones.gates, clones.inputs, clones.outputs), data)
  }

  static createGateMapper(gates, inputs, outputs) {
    return function(inputValues, context, node, prevContext) {
      for (let input of inputs) input.set(inputValues[input.index]);
      let res = Array.from({length: outputs.size}, _=>false)
      if (!context.subContexts.has(node)) context.subContexts.set(node, new ComputeContext())
      let subCtx = context.subContexts.get(node);
      if (subCtx.cached.has(node)) {
        return context.subContexts.get(node)..outputs;
      } else {
        for (let output of outputs) {
          res[outputs.index] = output.inputs[0]?output.inputs[0].node.compute(node):false
        }
      }
    }
  }

  static from(name, inputs, outputs, data) {
    let walked = new Map();
    let toWalk = new Stack();
    let trees = new Set();
    for (let output of outputs) {
      let treeNodes = new Set();
      let treeInputs = new Set();
      let connectedTrees = new Set();
      if (output && output.inputs[0]) {
        function walk(node, stack) {
          stack.push(node);
          treeNodes.add(node)
          for (let input of current.inputs) {
            if (input && !(input.node instanceof InputNode)) {
              if (stack.has(input.node)) {
                return Gate.graphGate(name, inputs, outputs, data)
              } else if (walked.has(input.node)) {
                connectedTrees.add(walked.get(input.node));
              } else {
                walk(input.node)
              }
            } else if (input) {
              treeInputs.add(input.node)
            }
          }
          stack.pop();
        }
        walk(output.inputs[0].node);
        let treeOutputs = new Set([output]);
        for (let other of connectedTrees) {
          for (let output of other.outputs) treeOutputs.add(output);
          for (let input of other.inputs) treeInputs.add(input);
        }
        let tree = new NodeTree(Array.from(treeInputs).sort(Gate.IOSorter), Array.from(treeOutputs).sort(Gate.IOSorter), treeNodes);
        for (let other of connectedTrees) {
          for (let node of other.nodes) {
            tree.nodes.add(node);
          }
          trees.delete(other);
        }
        trees.add(tree);
        for (let node of tree.nodes) walked.set(node, tree)

      } else if (output) {
        trees.add(new NodeTree([inputs[output.inputs[0].index]], [output], new Set(), new Set()))
      }
    }

    let tables = new Set();
    for (let tree of trees) {
      let mapping = new Map();
      for (let i = 0; i < (1<<tree.inputs.length); i ++) {
        for (let [j, input] of tree.inputs.entries()) {
          input.set((i & (1<<j)) >= 1);
        }
        let ctx = new ComputeContext(inputValues);
        mapping.set(i, tree.outputs.map(output=>output.inputs[0].node?(output.inputs[0].node.compute(ctx)[output.inputs[0].index]):false))
      }
      let table = new GateTable(tree, mapping)
      for (let [i, output] of Array.from(tree.outputs).sort(Gate.IOSorter).entries()) {
        output.table = table;
        output.tableIndex = i;
      }
      tables.add(table);
    }

    return new Gate(
      name,
      inputs.map(input=>input.name),
      outputs.map(output=>output.name),
      (inputValues)=>{
        let cache = new Map()
        for (let table of tables) {
          cache.set(table, table.compute(inputValues));
        }
        return outputs.map(output=>output.table?cache.get(output.table)[output.tableIndex]:false)
      },
      data
    )
  }
}

export const InputGate = new Gate("INPUT", [], ["Q"], ()=>([false]))
export const OutputGate = new Gate("OUTPUT", ["O"], [], ([o])=>([]))

export class GateTable {
  constructor(tree, mapping) {
    // Maps binary number to interable of output values. Standard example: '11'=>[0,1,1,0,0]
    this.mapping = mapping;
    this.tree = tree;
  }

  compute(inputs) {
    return Array.from(this.mapping.get(this.tree.inputs.reduce((o, input, i)=>{
      o |= (inputs[input.index]|0) << i;
      console.log(toBin(o));
      return o;
    }, 0)))
  }
}

export class NodeTree {
  constructor(inputs, outputs, nodes) {
    this.inputs = inputs;
    this.outputs = outputs;
    this.nodes = new Set(nodes);
  }
}

export const BufferGate = new Gate("BUFFER", ['A'], ['Q'], ([a])=>([a]))

export class ComputeContext {
  constructor(globalIns) {
    this.cached = new Map();
    this.processing = new Stack();
    this.subContexts = new Map();
    // this.inputs = globalIns;
  }

  cache(state) {
    this.cached.set(state.node, state);
    return state;
  }
}

export class GateState {
  constructor(node, outputs) {
    this.node = node;
    this.outputs = outputs;
  }
}

export class GateLink {
  constructor(node, index) {
    this.node = node;
    this.index = index;
  }

  copy() {
    return new GateLink(this.node, this.index)
  }
}

export class GateOutput extends GateLink {
  constructor(node, index, name) {
    super(node, index);
    this.name = name;
  }
}

export class GateInput extends GateLink {
  constructor(node, index, name) {
    super(node, index);
    this.name = name;
  }
}

export class GateNode {
  constructor(gate, inputs) {
    this.gate = gate;
    this.inputs = inputs;
  }

  link(inIndex, node, outIndex) {
    this.inputs[inIndex] = new GateLink(node, outIndex)
  }

  compute(context, prevContext = null) {
    context.processing.push(this);
    let res = this.gate.outputs.map(_=>false);
    if (context.cached.has(this)) {
      res = context.cached.get(this).outputs
    } else  {
      let outputs = this.gate.compute(this.inputs.map(
        input=>{
          if (input && input.node) {
            if (context.processing.has(input.node)) {
              return (prevContext&&prevContext.cached.has(input.node)?prevContext.cached.get(input.node).outputs[input.index]:false);
            } else return input.node.compute(context, prevContext)[input.index];
          } else return false;
        })
      );
      let state = new GateState(this, outputs)
      res = context.cache(state).outputs;
    }
    context.processing.pop();
    return res;
  }

  copy() {
    return new GateNode(this.gate, this.inputs.map(_=>null));
  }

  static clone(nodes, includeIO = false) {
    if (!(nodes instanceof Set)) nodes = new Set(nodes);
    let clones = new Map();
    let res = new Set();
    let inputs = new Set();
    let outputs = new Set();
    for (let node of nodes) {
      clones.set(node, node.copy())
      if (node instanceof InputNode || node instanceof OutputNode) {
        if (includeIO) {(node instanceof InputNode?inputs:outputs).add(clones.get(node))}
      } else res.add(clones.get(node))
    }
    for (let node of nodes) {
      for (let [i, input] of node.inputs.entries()) {
        if (input) {
          clones.get(node).link(i, clones.has(input.node)?clones.get(input.node):input.node, input.index);
          // let newInput = input.copy(clones);
          // if (clones.has(input.node)) newInput.node = clones.get(input.node);
          // if (clones.has(input.to)) newInput.to = clones.get(input.to);
          // .inputs[i] = newInput;
        }
      }
    }
    return {gates: res, inputs, outputs};
  }
}

export class InputNode extends GateNode {
  constructor(name, index) {
    super(InputGate, []);
    this.name = name;
    this.state = false;
    this.index = index;
  }

  set(state) {
    this.state = !!state;
  }

  toggle() {
    this.state = !this.state;
  }

  compute(context) {
    return context.cached.has(this) ? context.cached.get(this).outputs : context.cache(new GateState(this, [this.state])).outputs;
  }

  copy() {
    return new InputNode(this.name, this.index)
  }
}

export class OutputNode extends GateNode {
  constructor(name, index, inputs) {
    super(OutputGate, inputs);
    this.name = name;
    this.index = index;
  }

  compute(context) {
    // if (this.inputs[0]
    return []
  }

  copy() {
    return new OutputNode(this.name, this.index, [null])
  }
}
