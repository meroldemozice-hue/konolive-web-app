import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import type { DailyPerformance } from '@/lib/api';

interface Props {
  data: DailyPerformance[];
}

export const DailyPerformanceChart = ({ data }: Props) => {
  // Format the data to match exactly the required tick array [0, 500, 2000, 4000, 6000, 8000, 10000]
  // Because Recharts might auto-scale or space differently, we strictly set the domain and ticks.
  const ticks = [0, 500, 2000, 4000, 6000, 8000, 10000];
  
  return (
    <div className="w-full h-full relative overflow-hidden rounded-xl bg-[#0f141e]" style={{ border: '1px solid #1e293b' }}>
      {/* Background graphic simulation */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <path d="M500 0 L800 400 L400 600 Z" fill="none" stroke="#22c55e" strokeWidth="1" />
          <path d="M100 200 L500 0 L400 600 Z" fill="none" stroke="#22c55e" strokeWidth="1" />
          <path d="M800 400 L900 600 L400 600 Z" fill="none" stroke="#22c55e" strokeWidth="1" />
          <path d="M0 600 L100 200 L400 600 Z" fill="none" stroke="#22c55e" strokeWidth="1" />
        </svg>
      </div>

      <div className="relative z-10 px-2 py-6 h-full flex flex-col">
        <h2 className="text-center text-white text-base font-bold tracking-tight mb-8 shrink-0">
          Performances par jour
        </h2>
        <div className="flex-1 w-full pr-8 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={data} 
              layout="vertical" 
              margin={{ top: 0, right: 0, left: 10, bottom: 20 }}
              barCategoryGap="25%"
            >
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#4ade80" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#334155" opacity={0.6} />
              
              <XAxis 
                type="number" 
                ticks={ticks} 
                domain={[0, 10000]}
                tick={{ fill: '#f8fafc', fontSize: 9, fontWeight: 500 }} 
                axisLine={{ stroke: '#f8fafc', strokeWidth: 1 }} 
                tickLine={false}
                tickMargin={12}
              />
              
              {/* Fake XAxis for the title below the ticks */}
              <XAxis 
                xAxisId="label"
                type="number"
                hide
              />
              
              <YAxis 
                dataKey="day_name" 
                type="category" 
                axisLine={{ stroke: '#f8fafc', strokeWidth: 2 }} 
                tickLine={false} 
                tick={{ fill: '#f8fafc', fontSize: 10, fontWeight: 600 }} 
                width={80}
                tickMargin={10}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc' }}
                cursor={{ fill: '#1e293b', opacity: 0.4 }}
              />
              <Bar 
                dataKey="value" 
                fill="url(#barGradient)" 
                isAnimationActive={true}
              />
            </BarChart>
          </ResponsiveContainer>
          
          <div className="text-center w-full text-[#f8fafc] text-[10px] mt-1">
            Performances (unités)
          </div>
        </div>
      </div>
    </div>
  );
}
