import React from 'react';
import { X, Trophy, Dumbbell, Activity } from 'lucide-react';
import { Athlete } from '../data/athletes';

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
      
      <div className="relative bg-[#1c1c1c] w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-sm border border-white/10 shadow-2xl flex flex-col md:flex-row">
        
        {/* Close Button Mobile */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full text-white md:hidden"
        >
          <X size={24} />
        </button>

        {/* Image Section */}
        <div className="w-full md:w-1/2 aspect-[3/4] md:aspect-auto relative">
          <img 
            src={athlete.image} 
            alt={athlete.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1c1c1c] via-transparent to-transparent md:hidden" />
          <div className="absolute bottom-0 left-0 p-6 md:hidden">
            <h2 className="text-3xl font-black uppercase tracking-tighter text-white leading-none mb-1">
              {athlete.name}
            </h2>
            <p className="text-anvil-red font-bold uppercase tracking-wider">
              {athlete.category}
            </p>
          </div>
        </div>

        {/* Details Section */}
        <div className="w-full md:w-1/2 p-6 md:p-10 flex flex-col">
          {/* Close Button Desktop */}
          <div className="hidden md:flex justify-end mb-8">
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="hidden md:block mb-8">
            <h2 className="text-4xl font-black uppercase tracking-tighter text-white leading-none mb-2">
              {athlete.name}
            </h2>
            <p className="text-anvil-red font-bold uppercase tracking-wider text-xl">
              {athlete.category}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="space-y-8">
            
            {/* Main Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#252525] p-4 rounded-sm border border-white/5">
                <div className="flex items-center gap-2 mb-2 text-gray-400">
                  <Activity size={16} />
                  <span className="text-xs font-bold uppercase tracking-wider">GL Points</span>
                </div>
                <p className="text-3xl font-black text-white">{athlete.stats.glPoints}</p>
              </div>
              <div className="bg-[#252525] p-4 rounded-sm border border-white/5">
                <div className="flex items-center gap-2 mb-2 text-gray-400">
                  <Trophy size={16} />
                  <span className="text-xs font-bold uppercase tracking-wider">Total</span>
                </div>
                <p className="text-3xl font-black text-white">{athlete.stats.total} <span className="text-sm font-normal text-gray-500">kg</span></p>
              </div>
            </div>

            {/* Lifts */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
                <Dumbbell size={16} />
                Mejores Marcas
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-3 bg-[#252525] rounded-sm">
                  <p className="text-xs text-gray-500 uppercase mb-1">Squat</p>
                  <p className="text-xl font-bold text-white">{athlete.stats.squat}</p>
                </div>
                <div className="text-center p-3 bg-[#252525] rounded-sm">
                  <p className="text-xs text-gray-500 uppercase mb-1">Bench</p>
                  <p className="text-xl font-bold text-white">{athlete.stats.bench}</p>
                </div>
                <div className="text-center p-3 bg-[#252525] rounded-sm">
                  <p className="text-xs text-gray-500 uppercase mb-1">Deadlift</p>
                  <p className="text-xl font-bold text-white">{athlete.stats.deadlift}</p>
                </div>
              </div>
            </div>

            {/* Last Competition */}
            <div className="bg-anvil-red/10 p-4 rounded-sm border border-anvil-red/20">
              <p className="text-xs text-anvil-red font-bold uppercase tracking-wider mb-1">Última Competición</p>
              <p className="text-white font-bold">{athlete.stats.lastCompetition}</p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
