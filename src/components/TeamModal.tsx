import React from 'react';
import { X } from 'lucide-react';
import { Athlete } from '../data/athletes';

interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  athletes: Athlete[];
  onAthleteClick?: (athlete: Athlete) => void;
}

export const TeamModal: React.FC<TeamModalProps> = ({ isOpen, onClose, athletes, onAthleteClick }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-[#1c1c1c] w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#1c1c1c]/95 backdrop-blur border-b border-white/10 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tighter text-white">
              Nuestro Equipo
            </h2>
            <div className="w-12 h-1 bg-anvil-red mt-2" />
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Grid */}
        <div className="p-6 md:p-10">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {athletes.map((athlete) => (
              <div 
                key={athlete.id} 
                className="group relative aspect-[4/5] bg-[#252525] overflow-hidden rounded-xl cursor-pointer shadow-lg"
                onClick={() => onAthleteClick?.(athlete)}
              >
                <img 
                  src={athlete.image} 
                  alt={athlete.name}
                  className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" 
                />
                <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                  <p className="text-white font-bold uppercase tracking-wider text-lg">{athlete.name}</p>
                  <p className="text-xs text-anvil-red font-bold uppercase tracking-widest">{athlete.category}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
