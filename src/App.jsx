import React, { useState } from "react";

// This was written by ChatGPT with my guidance.
// There are a number of things I would do differently if I were
// turning it into production code, but as a proof-of-concept it is fine.

// It doesn't entirely properly handle the 2nd floor of the main building
// (office and library) being really the 2 1/2th floor

// Define staircases: which floors are connected in each building
const staircases = {
  1: [1, 2], // You can't get to the third floor via this staircase?
  2: [0, 1, 2, 3],
  3: [1, 3], // TODO: Do buildings 3 and 4 both have staircases??
  4: [0, 1, 2],
};

// Define external links (between rooms/buildings)
// <building>-<floor> format. A bldg-floor is listed then all the other bldg-floors it is connected to are listed in an array.
// Links are bidirectional so 1-1,[2-1] implies 2-1,[1-1]
// TODO: NOTE: THIS IS PROBABLY NOT 100% ACCURATE. THIS IS FROM MEMORY AND I'M JUST A NEPEAN PARENT
const rawGraph = {
  "1-1": ["2-1"],
  //  "1-2": ["2-2"],
  "1-3": ["2-3"],
  "2-0": ["5-1"], // Note: zeroth floor connected to floor 1
  "2-1": ["3-1"],
  //"2-2": ["3-2"],
  "2-3": ["3-3"],
};

// Building aliases
// TODO: Better names?
const buildingAliases = {
  1: "North Cafeteria",
  2: "Main",
  3: "Music/Auditorium",
  4: "Math/Science",
  5: "Gym",
};

class Node {
  constructor(building, floor) {
    this.building = parseInt(building);
    this.floor = parseInt(floor);
  }

  node() {
    return `${this.building}-${this.floor}`;
  }

  // equals(other) {
  //   return this.building === other.building && this.floor === other.floor;
  // }
  floorName() {
    const ordinal =
      ["Ground", "1st", "2nd", "3rd", "4th"][this.floor] || `${this.floor}th`;
    return `${ordinal} floor`;
  }

  static fromString(str) {
    const [building, floor] = str.split("-");
    return new Node(building, floor);
  }
}

class Room {
  constructor(number) {
    //if (number < 1000 || number > 9999) throw new Error("Invalid room number"); // Nope: zero-th floor
    const roomStr = number.toString().padStart(4, "0");
    this.room = number;
    this.floor = parseInt(roomStr[0]);
    //this.floor = customFloors[`${this.building}-${this.floor}`] || this.floor;
    this.building = parseInt(roomStr[1]);
    this.node = new Node(this.building, this.floor);
  }

  floorName() {
    return this.node.floorName();
  }
  describe() {
    const buildingName =
      buildingAliases[this.building] + " building" ||
      `Building ${this.building}`;
    return (
      <>
        <strong>Room {this.room}</strong> — {buildingName},{" "}
        <em>{this.floorName()}</em>
      </>
    );
  }
  node() {
    return this.node.node();
  }
}

// Add the simplified staircase definitions to the graph
function generateStairConnections(stairs) {
  const floorLinks = {};
  for (const building in stairs) {
    const floors = stairs[building];
    for (let i = 0; i < floors.length; i++) {
      for (let j = i + 1; j < floors.length; j++) {
        const a = new Node(building, floors[i]).node();
        const b = new Node(building, floors[j]).node();
        if (!floorLinks[a]) floorLinks[a] = [];
        if (!floorLinks[b]) floorLinks[b] = [];
        floorLinks[a].push(b);
        floorLinks[b].push(a);
      }
    }
  }
  return floorLinks;
}

// If you can reach A from B, you can reach B from A.
function makeBidirectional(graph) {
  const bidirectionalGraph = {};
  for (const node in graph) {
    if (!bidirectionalGraph[node]) bidirectionalGraph[node] = [];
    for (const neighbor of graph[node]) {
      bidirectionalGraph[node].push(neighbor);
      if (!bidirectionalGraph[neighbor]) bidirectionalGraph[neighbor] = [];
      if (!bidirectionalGraph[neighbor].includes(node)) {
        bidirectionalGraph[neighbor].push(node);
      }
    }
  }
  return bidirectionalGraph;
}

const staircaseLinks = generateStairConnections(staircases);
const mergedGraph = { ...rawGraph };
for (const node in staircaseLinks) {
  mergedGraph[node] = [...(mergedGraph[node] || []), ...staircaseLinks[node]];
}
const buildingGraph = makeBidirectional(mergedGraph);

// Find a path from start to end Nodes (floors-in-buildings)
function findPath(graph, start, end) {
  const queue = [[start.node()]];
  const visited = new Set();
  while (queue.length > 0) {
    const path = queue.shift();
    const node = path[path.length - 1];
    if (node === end.node()) return path.map(Node.fromString);
    if (visited.has(node)) continue;
    visited.add(node);
    for (const neighbor of graph[node] || []) {
      queue.push([...path, neighbor]);
    }
  }
  return null;
}

function specialInstructionsForGuidance() {
  return "To access the guidance department (room 2201), follow these steps: Go to the main building (where either set of main steps lead), go to the stairwell at the South end of the building, and you will find guidance a half-level below the 2nd floor.";
}

function describeStep(from, to) {
  if (!from || !to) return "";
  if (from.building !== to.building) {
    const name = buildingAliases[to.building] || `Building ${to.building}`;
    return `Change building to ${name} (${to.building})`;
  }
  if (from.floor !== to.floor) {
    const dir = to.floor > from.floor ? "up" : "down";
    return `Go ${dir} a level to the ${to.floorName()}`;
  }
  return `Walk on floor ${to.floor}`;
}

export default function App() {
  const [startRoom, setStartRoom] = useState("");
  const [endRoom, setEndRoom] = useState("");
  const [path, setPath] = useState([]);
  const [error, setError] = useState("");

  const handleNavigate = () => {
    setError("");
    let start, end;
    try {
      if (!/^\d{4}$/.test(startRoom) || !/^\d{4}$/.test(endRoom)) {
        throw "Invalid numbers";
      }
      start = new Room(parseInt(startRoom));
      end = new Room(parseInt(endRoom));
    } catch (e) {
      setError("Please enter valid 4-digit room numbers (e.g. 1234).");
      setPath([]);
      return;
    }

    const result = findPath(buildingGraph, start.node, end.node);
    if (result) {
      const steps = [];
      steps.push(start.describe());

      if (result.length === 1) {
        steps.push("You're already at the destination.");
      } else if (end.room == 2201) {
        steps.push(specialInstructionsForGuidance());
      } else {
        for (let i = 1; i < result.length; i++) {
          const step = result[i];
          const prev = result[i - 1];
          const isLastStep = i === result.length - 1;
          steps.push(describeStep(prev, step));
          if (isLastStep) {
            steps.push(
              <span>
                Walk on floor {step.floor} to reach {end.describe()}
              </span>
            );
          }
        }
      }

      setPath(steps);
    } else {
      setPath(["No route found"]);
    }
  };

  return (
    <div style={{ padding: "1rem", maxWidth: "500px", margin: "auto" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
        Nepean HS Navigator
      </h1>

      <div style={{ marginBottom: "1rem" }}>
        <input
          placeholder="Start Room (e.g. '2205' which is the library)"
          value={startRoom}
          onChange={(e) => setStartRoom(e.target.value)}
          style={{ width: "100%", padding: "0.5rem" }}
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <input
          placeholder="End Room (e.g. 3341)"
          value={endRoom}
          onChange={(e) => setEndRoom(e.target.value)}
          style={{ width: "100%", padding: "0.5rem" }}
        />
      </div>

      <button
        onClick={handleNavigate}
        style={{ padding: "0.5rem 1rem", marginBottom: "1rem" }}
      >
        Navigate
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {path.length > 0 && (
        <div>
          <h2>Path:</h2>
          <ul>
            {path.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
