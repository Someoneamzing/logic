import {Gate, GateNode, ComputeContext, GateLink, GateInput, GateOutput, InputNode, OutputNode} from './logic.mjs';

const OrGate = new Gate("OR", ["A", "B"], ["X"], ([a, b])=>([a || b]));
const AndGate = new Gate("AND", ["A", "B"], ["X"], ([a, b])=>([a && b]));
const NotGate = new Gate("NOT", ["A"], ["X"], ([a])=>([!a]));
const XorGate = new Gate("XOR", ["A", "B"], ["X"], ([a, b])=>([(a || b) && !(a && b)]));

const inputs = [
  new InputNode("A", 0),
  new InputNode("B", 1),
  new InputNode("Cin", 2),
]

const xor1 = new GateNode(XorGate, [new GateLink(null, 0), new GateLink(null, 1)]);
const xor2 = new GateNode(XorGate, [new GateLink(xor1, 0), new GateLink(null, 2)]);
const and1 = new GateNode(AndGate, [new GateLink(null, 0), new GateLink(null, 1)]);
const and2 = new GateNode(AndGate, [new GateLink(xor1, 0), new GateLink(null, 2)]);
const or1 = new GateNode(OrGate, [new GateLink(and1, 0), new GateLink(and2, 0)]);

const outputs = [
  new OutputNode( "SUM", 0,[new GateLink(xor2, 0)]),
  new OutputNode("Cout", 1,[new GateLink(or1, 0)])
]

let ctxs = Array.from({length: 1<<inputs.length}, (_,i)=>new ComputeContext(i.toString(2).padStart(inputs.length, '0').split('').map(e=>e|0?true:false)));
console.log(ctxs);

const FullAdder = Gate.from("FULL ADDDER", inputs, outputs);
const testGate = new GateNode(FullAdder, inputs);
console.log(ctxs.map(ctx=>testGate.compute(ctx)));

//// TODO: Add gate compilation.
// TODO: Add Gate editing UI
// Look into seperating truth tables for one gate to avoid large address spaces for gates that have seperate sections.
