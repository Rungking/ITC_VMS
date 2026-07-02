"use client";

import React, { useEffect } from "react";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { 
  Network, 
  Database, 
  Cpu
} from "lucide-react";
import Link from "next/link";
import { useAppContext } from "@/components/providers";
import { ClientOnly } from "@/components/ClientOnly";

// 🎨 Custom Node Component (Read Only)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DeviceNode = ({ data }: any) => {
  const Icon = data.type === "SWITCH" ? Network : data.type === "NVR" ? Database : Cpu;
  const isOnline = data.status === "active";
  
  // Base colors based on type
  const typeColors = {
    SWITCH: { icon: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20", border: "border-purple-200 dark:border-purple-800" },
    NVR: { icon: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800" },
    IPC: { icon: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800" }
  };

  const theme = typeColors[data.type as keyof typeof typeColors] || typeColors.IPC;

  return (
    <div className={`px-4 py-3 shadow-md rounded-xl border-2 transition-all ${theme.bg} ${isOnline ? theme.border : "border-zinc-300 dark:border-zinc-700 opacity-80"} min-w-[170px]`}>
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

function TopologyView() {
  const { cameras } = useAppContext();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const getFiniteCoordinate = (value: number | string | null | undefined) => {
    const numericValue = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  };

  useEffect(() => {
    if (cameras.length === 0) return;

    const newNodes = cameras.reduce<Node[]>((acc, cam) => {
      const topoX = getFiniteCoordinate(cam.topoX);
      const topoY = getFiniteCoordinate(cam.topoY);

      if (topoX === null || topoY === null) return acc;

      acc.push({
        id: cam.id,
        type: "device",
        position: { x: topoX, y: topoY },
        dragHandle: ".drag-handle", // Allow interaction if needed, or set draggable: false
        draggable: false, // Read only
        data: {
          label: cam.name,
          type: cam.type,
          ip: cam.ipAddress || cam.ip,
          ports: cam.ports,
          status: cam.status,
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
  }, [cameras, setNodes, setEdges]);

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
      </ReactFlow>
    </div>
  );
}

export default function TopologyPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top Header */}
      <div className="p-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
            <Network className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Network Topology</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Current network layout and status overview</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            <Link 
            href="/settings/topology"
            className="px-4 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors flex items-center gap-2 border border-zinc-200 dark:border-zinc-800"
          >
            Edit Layout
          </Link>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 min-h-0 bg-zinc-100 dark:bg-black p-4">
        <div className="h-full w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden border-dashed">
          <ReactFlowProvider>
            <ClientOnly>
              <TopologyView />
            </ClientOnly>
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  );
}
