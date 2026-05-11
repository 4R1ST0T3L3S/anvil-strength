import React from 'react';
import { X, Trophy, Dumbbell, Activity } from 'lucide-react';
import { Athlete } from '../../data/athletes';

interface AthleteDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  athlete: Athlete | null;
}

export const AthleteDetailsModal: React.FC<AthleteDetailsModalProps> = ({ isOpen, onClose, athlete }) => {
  if (!isOpen || !athlete) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-[#1c1c1c] w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl border border-white/10 shadow-2xl flex flex-col md:flex-row">
        
        {/* Close Button Mobile */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-[80] p-2 bg-black/50 rounded-full text-white md:hidden"
        >
          <X size={24} />
        </button>

        {/* Image Section - Sticky on Desktop */}
        <div className="w-full md:w-[45%] h-[40vh] md:h-auto relative bg-black shrink-0">
          <img
            src={athlete.image}
            alt={athlete.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1c1c1c] via-transparent to-transparent md:hidden" />
          <div className="absolute bottom-0 left-0 p-6 md:hidden">
            <h2 className="text-3xl font-black uppercase tracking-tighter text-white leading-none mb-1 font-bebas italic">
              {athlete.name}
            </h2>
            <p className="text-anvil-red font-bold uppercase tracking-wider text-xs">
              {athlete.category}
            </p>
          </div>
        </div>

        {/* Details Section - Scrollable on Desktop */}
        <div className="flex-1 overflow-y-auto p-8 md:p-16 custom-scrollbar bg-gradient-to-b from-[#1c1c1c] to-[#141414]">
          {/* Close Button Desktop */}
          <div className="hidden md:flex justify-end mb-12">
            <button
              onClick={onClose}
              className="p-3 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all rounded-full border border-white/10"
            >
              <X size={24} />
            </button>
          </div>

          <div className="hidden md:block mb-12">
            <h2 className="text-6xl font-black uppercase tracking-tighter text-white leading-[1.1] mb-2 font-bebas italic py-2">
              {athlete.name}
            </h2>
            <p className="text-anvil-red font-black uppercase tracking-widest text-lg">
              {athlete.category}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="space-y-12">
            {/* Main Stats */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-[#252525] p-6 rounded-2xl border border-white/5 shadow-2xl group hover:border-anvil-red/30 transition-all">
                <div className="flex items-center gap-3 mb-4 text-gray-500">
                  <Activity size={18} />
                  <span className="text-[10px] font-black uppercase tracking-widest">GL Points</span>
                </div>
                <p className="text-5xl font-black text-white">{athlete.stats.glPoints}</p>
              </div>
              <div className="bg-[#252525] p-6 rounded-2xl border border-white/5 shadow-2xl group hover:border-anvil-red/30 transition-all">
                <div className="flex items-center gap-3 mb-4 text-gray-500">
                  <Trophy size={18} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Total</span>
                </div>
                <p className="text-5xl font-black text-white">{athlete.stats.total} <span className="text-sm font-normal text-gray-500 uppercase">kg</span></p>
              </div>
            </div>

            {/* Lifts */}
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-8 flex items-center gap-4">
                <span className="w-8 h-[1px] bg-anvil-red" />
                Mejores Marcas
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Squat', value: athlete.stats.squat },
                  { label: 'Bench', value: athlete.stats.bench },
                  { label: 'Deadlift', value: athlete.stats.deadlift }
                ].map((lift) => (
                  <div key={lift.label} className="text-center p-6 bg-[#252525] rounded-2xl border border-white/5 hover:border-anvil-red/20 transition-all group">
                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-3 group-hover:text-anvil-red transition-colors">{lift.label}</p>
                    <p className="text-3xl font-black text-white">{lift.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Last Competition */}
            <div className="bg-gradient-to-r from-anvil-red/20 to-transparent p-8 rounded-2xl border border-anvil-red/30 shadow-xl relative overflow-hidden group">
              <div className="relative z-10">
                <p className="text-[10px] text-anvil-red font-black uppercase tracking-[0.2em] mb-3">Última Competición</p>
                <p className="text-2xl text-white font-black uppercase font-bebas italic tracking-wider">{athlete.stats.lastCompetition}</p>
              </div>
              <Trophy className="absolute right-6 top-1/2 -translate-y-1/2 text-anvil-red/10 group-hover:scale-125 transition-transform duration-700" size={80} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
