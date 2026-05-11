import React from 'react';
import { X, Instagram, Mail, FileText } from 'lucide-react';
import { Coach } from '../../data/coaches';

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
            src={coach.image}
            alt={coach.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1c1c1c] via-transparent to-transparent md:hidden" />
          <div className="absolute bottom-0 left-0 p-6 md:hidden">
            <h2 className="text-3xl font-black uppercase tracking-tighter text-white leading-none mb-1 font-bebas italic">
              {coach.name}
            </h2>
            <p className="text-anvil-red font-bold uppercase tracking-wider text-xs">
              {coach.role}
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
              {coach.name}
            </h2>
            <p className="text-anvil-red font-black uppercase tracking-widest text-lg">
              {coach.role}
            </p>
          </div>

          {/* Bio */}
          <div className="mb-12">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-6 flex items-center gap-4">
              <span className="w-8 h-[1px] bg-anvil-red" />
              Presentación
            </h3>
            <p className="text-gray-300 leading-relaxed whitespace-pre-line text-lg font-medium">
              {coach.bio}
            </p>
          </div>

          {/* Contact */}
          <div className="mt-auto">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-6 flex items-center gap-4">
              <span className="w-8 h-[1px] bg-anvil-red" />
              Contacto Directo
            </h3>
            <div className="flex flex-wrap gap-4">
              <a
                href={coach.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-6 py-4 bg-[#252525] hover:bg-anvil-red text-white transition-all rounded-2xl group border border-white/5"
              >
                <Instagram size={20} className="group-hover:scale-110 transition-transform" />
                <span className="font-black uppercase text-xs tracking-widest">Instagram</span>
              </a>
              {coach.contactForm && (
                <a
                  href={coach.contactForm}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-6 py-4 bg-[#252525] hover:bg-anvil-red text-white transition-all rounded-2xl group border border-white/5"
                >
                  <FileText size={20} className="group-hover:scale-110 transition-transform" />
                  <span className="font-black uppercase text-xs tracking-widest">Formulario</span>
                </a>
              )}
              {coach.email && (
                <a
                  href={`mailto:${coach.email}`}
                  className="flex items-center gap-3 px-6 py-4 bg-[#252525] hover:bg-anvil-red text-white transition-all rounded-2xl group border border-white/5"
                >
                  <Mail size={20} className="group-hover:scale-110 transition-transform" />
                  <span className="font-black uppercase text-xs tracking-widest">Email</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
