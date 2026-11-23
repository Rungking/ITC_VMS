"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { 
  Network, 
  Database, 
  Cpu, 
  Save, 
  ArrowLeft, 
  Zap, 
  Wifi, 
  Activity,
  Trash2,
  Search,
  Target,
  AlignVerticalSpaceAround,
  AlignHorizontalSpaceAround,
  BetweenHorizontalEnd,
  BetweenVerticalEnd
} from "lucide-react";
import Link from "next/link";
import { useAppContext } from "@/components/providers";
import { ClientOnly } from "@/components/ClientOnly";

// 🎨 Custom Node Component
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DeviceNode = ({ data, selected }: any) => {
  const Icon = data.type === "SWITCH" ? Network : data.type === "NVR" ? Database : Cpu;
  const color = data.type === "SWITCH" ? "text-purple-500" : data.type === "NVR" ? "text-blue-500" : "text-emerald-500";
  const bgColor = data.type === "SWITCH" ? "bg-purple-50 dark:bg-purple-900/20" : data.type === "NVR" ? "bg-blue-50 dark:bg-blue-900/20" : "bg-emerald-50 dark:bg-emerald-900/20";
  const borderColor = data.type === "SWITCH" ? "border-purple-200 dark:border-purple-800" : data.type === "NVR" ? "border-blue-200 dark:border-blue-800" : "border-emerald-200 dark:border-emerald-800";
  const selectedClasses = selected
    ? "ring-4 ring-indigo-400/40 dark:ring-indigo-500/30 border-indigo-500 dark:border-indigo-400 shadow-xl shadow-indigo-500/20 scale-[1.02]"
    : "hover:shadow-lg";

  return (
    <div className={`relative px-4 py-3 shadow-md rounded-xl border-2 transition-all duration-150 ${bgColor} ${borderColor} ${selectedClasses} min-w-[150px]`}>
      {selected && (
        <div className="absolute -top-2 left-3 rounded-full bg-indigo-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-md">
          Selected
        </div>
      )}
      {/* 📍 Connection Points (Handles) */}
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-3 h-3 !bg-zinc-400 dark:!bg-zinc-600 border-2 border-white dark:border-zinc-900" 
      />
      
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-white dark:bg-zinc-800 border transition-colors ${selected ? "border-indigo-400 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40" : borderColor}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-tighter">
            {data.type}
          </div>
          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[120px]">
            {data.label}
          </div>
          <div className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
            {data.ip || "N/A"}
          </div>
        </div>
      </div>
      {/* Ports info for switches */}
      {data.type === "SWITCH" && (
        <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-700 flex justify-between items-center">
          <span className="text-[9px] text-zinc-400 uppercase font-black tracking-widest">
            {data.ports || 8} PORTS
          </span>
          <div className="flex gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${data.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
          </div>
        </div>
      )}

      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-3 h-3 !bg-zinc-400 dark:!bg-zinc-600 border-2 border-white dark:border-zinc-900" 
      />
    </div>
  );
};

const nodeTypes = {
  device: DeviceNode,
};

function TopologyContent() {
  const { cameras, refresh: refreshCameras } = useAppContext();
  const { setCenter, screenToFlowPosition } = useReactFlow();
  
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [saving, setSaving] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const getFiniteCoordinate = (value: number | string | null | undefined) => {
    const numericValue = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  };

  // Initialize nodes and edges from cameras
  useEffect(() => {
    if (cameras.length === 0) return;

    // Include all cameras. If topo coordinates are missing, arrange them in a grid
    const newNodes = cameras.map((cam, idx) => {
        const topoX = getFiniteCoordinate(cam.topoX);
        const topoY = getFiniteCoordinate(cam.topoY);
        
        // Default positioning for unplaced devices
        const defaultX = (idx % 6) * 200;
        const defaultY = Math.floor(idx / 6) * 100 - 500;

        return {
          id: cam.id,
          type: "device",
          position: { 
            x: topoX !== null ? topoX : defaultX, 
            y: topoY !== null ? topoY : defaultY 
          },
          data: {
            label: cam.name,
            type: cam.type,
            ip: cam.ipAddress || cam.ip,
            ports: cam.ports,
            status: cam.status,
          },
        };
      });

    const newEdges: Edge[] = cameras
      .filter((cam) => cam.parentId)
      .map((cam) => {
        const connectionType = cam.connectionType || "ETHERNET";
        let color = "#94a3b8"; // slate-400
        let label = "Ethernet";
        const style: React.CSSProperties = { strokeWidth: 2 };
        
        if (connectionType === "FIBER") {
          color = "#ec4899"; // pink-500
          label = "Fiber";
          style.strokeDasharray = "5,5";
        } else if (connectionType === "WIRELESS") {
          color = "#3b82f6"; // blue-500
          label = "Wireless";
          style.strokeDasharray = "2,2";
        }

        return {
          id: `e-${cam.parentId}-${cam.id}`,
          source: cam.parentId!,
          target: cam.id,
          label: label,
          labelStyle: { fontSize: 10, fill: color, fontWeight: 700 },
          style: { stroke: color, ...style },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: color,
          },
          data: { type: connectionType, port: cam.parentPort },
        };
      });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [cameras, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `e-${params.source}-${params.target}`,
        label: "Ethernet",
        style: { stroke: "#94a3b8", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
        data: { type: "ETHERNET" },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      // All cameras in database should have their topo info updated
      const updates = cameras.map((cam) => {
        const node = nodes.find((n) => n.id === cam.id);
        const edge = edges.find((e) => e.target === cam.id);
        
        return {
          id: cam.id,
          topoX: node ? getFiniteCoordinate(node.position.x) : null,
          topoY: node ? getFiniteCoordinate(node.position.y) : null,
          parentId: edge ? edge.source : null,
          connectionType: edge ? edge.data?.type : "ETHERNET",
          parentPort: edge ? edge.data?.port : null
        };
      });

      const res = await fetch("/api/zm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk: true, items: updates }),
      });

      if (res.ok) {
        alert("Topology saved successfully!");
        refreshCameras(true);
      } else {
        const errorPayload = await res.json().catch(() => null);
        const message = errorPayload?.error || "Failed to save topology";
        alert(message);
      }
    } catch (err) {
      console.error(err);
      alert("Error saving topology");
    } finally {
      setSaving(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onEdgeClick = (_: any, edge: Edge) => {
    setSelectedEdge(edge);
  };

  const clearSelection = useCallback(() => {
    setNodes((nds) => nds.map((node) => (node.selected ? { ...node, selected: false } : node)));
    setSelectedEdge(null);
  }, [setNodes]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearSelection();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [clearSelection]);

  const updateEdgeType = (type: string) => {
    if (!selectedEdge) return;
    
    let color = "#94a3b8";
    let label = "Ethernet";
    const style: React.CSSProperties = { strokeWidth: 2 };

    if (type === "FIBER") {
      color = "#ec4899";
      label = "Fiber";
      style.strokeDasharray = "5,5";
    } else if (type === "WIRELESS") {
      color = "#3b82f6";
      label = "Wireless";
      style.strokeDasharray = "2,2";
    }

    setEdges((eds) =>
      eds.map((e) =>
        e.id === selectedEdge.id
          ? {
              ...e,
              label,
              style: { stroke: color, ...style },
              markerEnd: { 
                ...(typeof e.markerEnd === 'object' ? e.markerEnd : {}), 
                color,
                type: MarkerType.ArrowClosed
              },
              labelStyle: { 
                ...(typeof e.labelStyle === 'object' ? e.labelStyle : {}), 
                fill: color 
              },
              data: { ...e.data, type },
            }
          : e
      )
    );
    setSelectedEdge(null);
  };

  const focusNode = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      setCenter(node.position.x + 75, node.position.y + 35, { zoom: 1.5, duration: 800 });
    }
  };

  const arrangeNodes = (direction: "horizontal" | "vertical") => {
    const selectedNodes = nodes.filter(n => n.selected);
    if (selectedNodes.length < 2) return;

    const targetX = Math.min(...selectedNodes.map((n) => n.position.x));
    const targetY = Math.min(...selectedNodes.map((n) => n.position.y));

    setNodes((nds) => {
      return nds.map((node) => {
        if (!node.selected) return node;

        const x = direction === "vertical" ? targetX : node.position.x;
        const y = direction === "horizontal" ? targetY : node.position.y;
        
        return {
          ...node,
          position: { x, y }
        };
      });
    });
  };

  const distributeNodes = (direction: "horizontal" | "vertical") => {
    const selectedNodes = nodes.filter(n => n.selected);
    if (selectedNodes.length < 3) return; // Need at least 3 for distribution

    const sorted = [...selectedNodes].sort((a, b) => 
      direction === "horizontal" ? a.position.x - b.position.x : a.position.y - b.position.y
    );

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const totalDist = direction === "horizontal"
      ? last.position.x - first.position.x
      : last.position.y - first.position.y;

    const defaultStep = direction === "horizontal" ? 250 : 150;
    const step = totalDist === 0 ? defaultStep : totalDist / (sorted.length - 1);

    setNodes((nds) => {
      return nds.map((node) => {
        const idx = sorted.findIndex(s => s.id === node.id);
        if (idx === -1) return node;

        return {
          ...node,
          position: {
            x: direction === "horizontal" ? first.position.x + (idx * step) : node.position.x,
            y: direction === "vertical" ? first.position.y + (idx * step) : node.position.y
          }
        };
      });
    });
  };

  const onDragStart = (event: React.DragEvent, camera: import("@/types").Camera) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(camera));
    event.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const data = event.dataTransfer.getData("application/reactflow");
      if (!data) return;

      const camera = JSON.parse(data);
      
      // Check if node already exists
      if (nodes.find(n => n.id === camera.id)) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: camera.id,
        type: "device",
        position,
        data: { 
          label: camera.name, 
          type: camera.type, 
          ip: camera.ipAddress || camera.ip,
          ports: camera.ports,
          status: camera.status
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [nodes, screenToFlowPosition, setNodes]
  );

  const filteredCameras = cameras.filter((cam) =>
    cam.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (cam.ipAddress || cam.ip || "").includes(searchTerm)
  );

  const selectedCount = nodes.filter(n => n.selected).length;
  const selectedNodeSummaries = nodes
    .filter((node) => node.selected)
    .map((node) => ({
      id: node.id,
      label: String(node.data?.label || node.id),
    }));

  return (
    <div className="h-screen w-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Header Panel */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <Link href="/settings" className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Network className="w-6 h-6 text-purple-600" />
              Network Topology Editor
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Drag devices to arrange, drag lines to connect, Ctrl/Cmd+Click to multi-select</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {selectedCount >= 2 && (
            <div className="flex items-center bg-indigo-50 dark:bg-indigo-900/20 p-1 rounded-xl mr-2 border border-indigo-100 dark:border-indigo-800 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="px-2 text-[10px] font-black uppercase text-indigo-500 dark:text-indigo-400 border-r border-indigo-200 dark:border-indigo-800 mr-1">
                {selectedCount} Selected
              </div>
              <button
                onClick={() => arrangeNodes("horizontal")}
                title="Align Horizontally"
                className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded-lg transition-colors text-indigo-600 dark:text-indigo-400"
              >
                <AlignHorizontalSpaceAround className="w-4 h-4" />
              </button>
              <button
                onClick={() => arrangeNodes("vertical")}
                title="Align Vertically"
                className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded-lg transition-colors text-indigo-600 dark:text-indigo-400"
              >
                <AlignVerticalSpaceAround className="w-4 h-4" />
              </button>
              
              {selectedCount >= 3 && (
                <>
                  <div className="w-px h-4 bg-indigo-200 dark:bg-indigo-800 mx-1" />
                  <button
                    onClick={() => distributeNodes("horizontal")}
                    title="Distribute Horizontally"
                    className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded-lg transition-colors text-indigo-600 dark:text-indigo-400"
                  >
                    <BetweenHorizontalEnd className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => distributeNodes("vertical")}
                    title="Distribute Vertically"
                    className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded-lg transition-colors text-indigo-600 dark:text-indigo-400"
                  >
                    <BetweenVerticalEnd className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-500/20 font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Layout
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Device Sidebar */}
        <div className="w-80 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search by name or IP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-500 dark:text-zinc-400">
                {filteredCameras.length} devices
              </span>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-indigo-50 px-2 py-1 font-bold text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400">
                  {selectedCount} selected
                </span>
                {selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="rounded-full bg-zinc-100 px-2 py-1 font-semibold text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium dark:bg-zinc-800">
                Ctrl/Cmd+Click: Multi-select
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium dark:bg-zinc-800">
                Esc: Clear selection
              </span>
            </div>
            {selectedCount > 0 && (
              <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Selected Devices
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedNodeSummaries.slice(0, 3).map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => focusNode(node.id)}
                      className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-300"
                    >
                      {node.label}
                    </button>
                  ))}
                  {selectedNodeSummaries.length > 3 && (
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-300">
                      +{selectedNodeSummaries.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {filteredCameras.map((cam) => {
              const Icon = cam.type === "SWITCH" ? Network : cam.type === "NVR" ? Database : Cpu;
              const color = cam.type === "SWITCH" ? "text-purple-500" : cam.type === "NVR" ? "text-blue-500" : "text-emerald-500";
              const bgColor = cam.type === "SWITCH" ? "bg-purple-50 dark:bg-purple-900/10" : cam.type === "NVR" ? "bg-blue-50 dark:bg-blue-900/10" : "bg-emerald-50 dark:bg-emerald-900/10";
              
              const isAlreadyOnCanvas = nodes.some(n => n.id === cam.id);
              
              return (
                <button
                  key={cam.id}
                  draggable={!isAlreadyOnCanvas}
                  onDragStart={(e) => onDragStart(e, cam)}
                  onClick={() => isAlreadyOnCanvas ? focusNode(cam.id) : null}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border border-transparent transition-all group text-left ${
                    isAlreadyOnCanvas 
                      ? "opacity-50 cursor-default bg-zinc-50 dark:bg-zinc-800/30" 
                      : "hover:border-zinc-200 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-grab active:cursor-grabbing"
                  }`}
                >
                  <div className={`p-2 rounded-lg ${bgColor}`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate">{cam.name}</div>
                    <div className="text-[10px] text-zinc-500 font-mono truncate">{cam.ipAddress || cam.ip || "No IP"}</div>
                  </div>
                  {isAlreadyOnCanvas ? (
                    <Target className="w-4 h-4 text-purple-500 opacity-60" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-dashed border-zinc-300 group-hover:border-purple-400 transition-colors" />
                  )}
                </button>
              );
            })}
            {filteredCameras.length === 0 && (
              <div className="py-10 text-center text-zinc-400 text-sm">No devices found</div>
            )}
          </div>
        </div>

        {/* Main Flow Canvas */}
        <div
          className="flex-1 relative overflow-hidden bg-zinc-50 dark:bg-zinc-950"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(113,113,122,0.22) 1px, transparent 0)",
            backgroundSize: "20px 20px",
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onPaneClick={clearSelection}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            multiSelectionKeyCode={["Control", "Meta"]}
            fitView
            minZoom={0.1}
            maxZoom={1.5}
            defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
            colorMode="system"
          >
            <Controls />
            <MiniMap 
              nodeColor={(n) => {
                if (n.data?.type === 'SWITCH') return '#a855f7';
                if (n.data?.type === 'NVR') return '#3b82f6';
                return '#10b981';
              }}
            />
          </ReactFlow>
        </div>
      </div>

      {/* Connection Selection Modal */}
      {selectedEdge && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-4 text-zinc-900 dark:text-zinc-100">Connection Types</h3>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => updateEdgeType("ETHERNET")}
                className="flex items-center justify-between p-4 rounded-xl border-2 border-slate-100 dark:border-zinc-800 hover:border-slate-400 dark:hover:border-zinc-600 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 dark:bg-zinc-800 rounded-lg text-slate-500">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-700 dark:text-zinc-100">Ethernet Cable</div>
                    <div className="text-xs text-slate-400">Standard Cat5e/Cat6 copper connection</div>
                  </div>
                </div>
                <div className="w-8 h-1 bg-slate-400 rounded-full" />
              </button>

              <button
                onClick={() => updateEdgeType("FIBER")}
                className="flex items-center justify-between p-4 rounded-xl border-2 border-pink-50/50 dark:border-zinc-800 hover:border-pink-300 dark:hover:border-zinc-600 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-pink-100 dark:bg-pink-900/20 rounded-lg text-pink-500">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-pink-600 dark:text-pink-400">Fiber Optic</div>
                    <div className="text-xs text-pink-400">High-speed backbone fiber link</div>
                  </div>
                </div>
                <div className="w-8 h-1 bg-pink-500 rounded-full border-t border-dashed" />
              </button>

              <button
                onClick={() => updateEdgeType("WIRELESS")}
                className="flex items-center justify-between p-4 rounded-xl border-2 border-blue-50/50 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-zinc-600 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg text-blue-500">
                    <Wifi className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-blue-600 dark:text-blue-400">Wireless / Wifi</div>
                    <div className="text-xs text-blue-400">Point-to-Point wireless link</div>
                  </div>
                </div>
                <div className="w-8 h-1 bg-blue-500 rounded-full opacity-50" style={{ borderTop: '2px dotted' }} />
              </button>

              <button
                onClick={() => {
                  setEdges(eds => eds.filter(e => e.id !== selectedEdge.id));
                  setSelectedEdge(null);
                }}
                className="mt-2 flex items-center justify-center gap-2 p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-colors font-semibold"
              >
                <Trash2 className="w-4 h-4" />
                Remove Link
              </button>
            </div>
            
            <button
              onClick={() => setSelectedEdge(null)}
              className="mt-6 w-full py-2.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TopologyPage() {
  return (
    <ClientOnly>
      <ReactFlowProvider>
        <TopologyContent />
      </ReactFlowProvider>
    </ClientOnly>
  );
}
