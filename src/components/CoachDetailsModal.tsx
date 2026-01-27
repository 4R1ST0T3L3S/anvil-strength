import React from 'react';
import { X, Instagram, Mail } from 'lucide-react';
import { Coach } from '../data/coaches';

interface CoachDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  coach: Coach | null;
}

export const CoachDetailsModal: React.FC<CoachDetailsModalProps> = ({ isOpen, onClose, coach }) => {
  if (!isOpen || !coach) return null;

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
            src={coach.image} 
            alt={coach.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1c1c1c] via-transparent to-transparent md:hidden" />
          <div className="absolute bottom-0 left-0 p-6 md:hidden">
            <h2 className="text-3xl font-black uppercase tracking-tighter text-white leading-none mb-1">
              {coach.name}
            </h2>
            <p className="text-anvil-red font-bold uppercase tracking-wider">
              {coach.role}
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
              {coach.name}
            </h2>
            <p className="text-anvil-red font-bold uppercase tracking-wider text-xl">
              {coach.role}
            </p>
          </div>

          {/* Bio */}
          <div className="mb-8">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">Presentación</h3>
            <p className="text-gray-300 leading-relaxed whitespace-pre-line">
              {coach.bio}
            </p>
          </div>

          {/* Contact */}
          <div className="mt-auto">
             <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">Contacto</h3>
             <div className="flex gap-4">
                <a 
                  href={coach.instagram} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex items-center gap-2 px-4 py-2 bg-[#252525] hover:bg-anvil-red text-white transition-colors rounded-sm group"
                >
                  <Instagram size={20} />
                  <span className="font-bold uppercase text-sm">Instagram</span>
                </a>
                {coach.email && (
                  <a 
                    href={`mailto:${coach.email}`}
                    className="flex items-center gap-2 px-4 py-2 bg-[#252525] hover:bg-anvil-red text-white transition-colors rounded-sm"
                  >
                    <Mail size={20} />
                    <span className="font-bold uppercase text-sm">Email</span>
                  </a>
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
