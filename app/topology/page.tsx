"use client";

import React, { useEffect, useState } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType,
  ReactFlowProvider,
  Handle,
  Position,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { 
  Network, 
  Database, 
  Cpu,
  Search,
  X,
  Info,
  Maximize2,
  Settings2
} from "lucide-react";
import Link from "next/link";
import { useAppContext } from "@/components/providers";
import { ClientOnly } from "@/components/ClientOnly";

// 🎨 Custom Node Component (Read Only)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DeviceNode = ({ data }: any) => {
  const Icon = data.type === "SWITCH" ? Network : data.type === "NVR" ? Database : Cpu;
  const isOnline = data.status === "active";
  const isHighlighted = data.isHighlighted;
  const isSearchActive = data.isSearchActive;
  
  // Base colors based on type
  const typeColors = {
    SWITCH: { icon: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20", border: "border-purple-200 dark:border-purple-800" },
    NVR: { icon: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800" },
    IPC: { icon: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800" }
  };

  const theme = typeColors[data.type as keyof typeof typeColors] || typeColors.IPC;

  return (
    <div className={`px-4 py-3 shadow-md rounded-xl border-2 transition-all duration-300 ${theme.bg} ${isOnline ? theme.border : "border-zinc-300 dark:border-zinc-700"} ${isHighlighted ? "ring-4 ring-purple-500 dark:ring-purple-400 scale-110 border-purple-500 shadow-purple-500/20 shadow-2xl z-50" : isSearchActive ? "opacity-30 scale-95 grayscale-[0.5]" : "opacity-100"} min-w-[170px]`}>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-white dark:bg-zinc-800 border ${theme.border} relative`}>
          <Icon className={`w-5 h-5 ${isOnline ? theme.icon : "text-zinc-400"}`} />
          {/* Status Dot on Icon */}
          <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-800 ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-tighter">
              {data.type}
            </div>
            <div className={`text-[9px] px-1.5 rounded-full font-bold uppercase ${isOnline ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
              {isOnline ? "Online" : "Offline"}
            </div>
          </div>
          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
            {data.label}
          </div>
          <div className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
            {data.ip || "N/A"}
          </div>
        </div>
      </div>
      
      {data.type === "SWITCH" && (
        <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-700 flex justify-between items-center">
          <span className="text-[9px] text-zinc-400 uppercase font-black tracking-widest">
            {data.ports || 8} PORTS
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
};

const nodeTypes = {
  device: DeviceNode,
};

function TopologyView({ searchTerm }: { searchTerm: string }) {
  const { cameras } = useAppContext();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();

  const getFiniteCoordinate = (value: number | string | null | undefined) => {
    const numericValue = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  };

  // Update nodes and edges
  useEffect(() => {
    if (cameras.length === 0) return;

    const newNodes = cameras.reduce<Node[]>((acc, cam) => {
      const topoX = getFiniteCoordinate(cam.topoX);
      const topoY = getFiniteCoordinate(cam.topoY);

      if (topoX === null || topoY === null) return acc;

      const isSearchActive = searchTerm.trim() !== "";
      const isMatch = isSearchActive && (
        cam.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (cam.ipAddress || cam.ip)?.toLowerCase().includes(searchTerm.toLowerCase())
      );

      acc.push({
        id: cam.id,
        type: "device",
        position: { x: topoX, y: topoY },
        dragHandle: ".drag-handle",
        draggable: false, 
        data: {
          label: cam.name,
          type: cam.type,
          ip: cam.ipAddress || cam.ip,
          ports: cam.ports,
          status: cam.status,
          isHighlighted: isMatch,
          isSearchActive: isSearchActive,
        },
      });
      return acc;
    }, []);

    const newEdges: Edge[] = cameras
      .filter((cam) => cam.parentId)
      .map((cam) => {
        const connectionType = cam.connectionType || "ETHERNET";
        let color = "#94a3b8"; 
        let label = "Ethernet";
        const style: React.CSSProperties = { strokeWidth: 2 };
        
        if (connectionType === "FIBER") {
          color = "#ec4899";
          label = "Fiber";
          style.strokeDasharray = "5,5";
        } else if (connectionType === "WIRELESS") {
          color = "#3b82f6";
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
        };
      });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [cameras, searchTerm, setNodes, setEdges]);

  // Zoom to matching nodes
  useEffect(() => {
    if (searchTerm && nodes.length > 0) {
      const matchingNodes = nodes.filter(n => n.data.isHighlighted);
      if (matchingNodes.length > 0) {
        fitView({
          nodes: matchingNodes,
          duration: 400,
          padding: 0.5,
        });
      }
    }
  }, [searchTerm, nodes, fitView]);

  return (
    <div className="relative h-full w-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
      {/* Background Grid using CSS to avoid SVG NaN issues in React 19 */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.4]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #e2e8f0 1px, transparent 1px),
            linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        edgesFocusable={false}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable={true}
        colorMode="system"
      >
        <Controls showInteractive={false} className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl overflow-hidden" />
        <MiniMap 
          nodeStrokeWidth={3}
          maskColor="rgba(0, 0, 0, 0.1)"
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl !bottom-4 !right-4"
        />

        {/* Legend Overlay */}
        <div className="absolute top-4 right-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl z-10 pointer-events-none sm:pointer-events-auto">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <Info className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">Topology Legend</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-6 h-0.5 bg-slate-400" />
              <span className="text-[10px] font-medium text-zinc-500">Ethernet</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-0.5 border-t-2 border-dashed border-pink-500" />
              <span className="text-[10px] font-medium text-zinc-500">Fiber Optic</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-0.5 border-t-2 border-dotted border-blue-500" />
              <span className="text-[10px] font-medium text-zinc-500">Wireless</span>
            </div>
          </div>
        </div>
      </ReactFlow>
    </div>
  );
}

export default function TopologyPage() {
  const { cameras } = useAppContext();
  const [searchTerm, setSearchTerm] = useState("");

  const stats = {
    total: cameras.length,
    active: cameras.filter(c => c.status === "active").length,
    inactive: cameras.filter(c => c.status !== "active").length
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top Header */}
      <div className="p-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
            <Network className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Network Topology</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Current network layout and status overview</p>
          </div>
        </div>

        <div className="flex-1 max-w-md relative group">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-zinc-400 group-focus-within:text-purple-500 transition-colors">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search devices by name or IP..."
            className="w-full pl-10 pr-10 py-2.5 bg-zinc-100 dark:bg-zinc-800 border-2 border-transparent focus:border-purple-500/20 focus:bg-white dark:focus:bg-zinc-900 rounded-2xl text-sm transition-all outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors"
            >
              <X className="w-3.5 h-3.5 text-zinc-500" />
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-2">
            <Link 
            href="/settings/topology"
            className="px-4 py-2.5 text-xs font-black text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-2xl transition-all flex items-center gap-2 border border-purple-200/50 dark:border-purple-800/50 uppercase tracking-widest shadow-sm"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Edit Layout
          </Link>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="px-6 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-8">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Database</span>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-zinc-900 dark:text-zinc-100 leading-none">{stats.total}</span>
              <span className="text-[10px] font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded uppercase">Devices</span>
            </div>
          </div>
          
          <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-800" />
          
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-emerald-500/80 dark:text-emerald-400/80 uppercase tracking-widest flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </span>
            <span className="text-xl font-black text-zinc-900 dark:text-zinc-100 leading-none">{stats.active}</span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              Offline
            </span>
            <span className="text-xl font-black text-zinc-900 dark:text-zinc-100 leading-none">{stats.inactive}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSearchTerm("")}
            className="p-2 text-zinc-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-xl transition-all"
            title="Reset View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 min-h-0 bg-zinc-100 dark:bg-black p-4">
        <div className="h-full w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden border-dashed">
          <ReactFlowProvider>
            <ClientOnly>
              <TopologyView searchTerm={searchTerm} />
            </ClientOnly>
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  );
}
