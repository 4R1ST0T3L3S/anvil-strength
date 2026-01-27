import React, { useState, useEffect } from 'react';
import { MessageSquare, User, Send, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Comment {
  id: number;
  content: string;
  author: string;
  user_id: string;
  created_at: string;
}

interface Post {
  id: number;
  title: string;
  content: string;
  author: string;
  created_at: string;
}

interface BlogSectionProps {
  user: any;
}

export const BlogSection: React.FC<BlogSectionProps> = ({ user }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, []);

  useEffect(() => {
    if (selectedPost) {
      fetchComments(selectedPost.id);
    }
  }, [selectedPost]);

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error('Error fetching posts:', error);
    }
  };

  const fetchComments = async (postId: number) => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setComments(data || []);
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedPost || !newComment.trim()) return;

    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Usuario no autenticado');

      const { error } = await supabase
        .from('comments')
        .insert([
          {
            post_id: selectedPost.id,
            user_id: authUser.id,
            content: newComment,
            author: user.nickname || user.name || 'Atleta'
          }
        ]);

      if (error) throw error;

      setNewComment('');
      fetchComments(selectedPost.id);
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      if (selectedPost) {
        fetchComments(selectedPost.id);
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
    }
  };

  return (
    <section id="blog" className="py-24 bg-[#1c1c1c]">
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="flex justify-between items-end mb-16">
          <div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-4">Comunidad</h2>
            <div className="w-20 h-1 bg-anvil-red"></div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Posts List */}
          <div className="lg:col-span-1 space-y-6">
            <h3 className="text-xl font-bold uppercase tracking-wider text-gray-400 mb-6">Últimas Noticias</h3>
            {posts.length === 0 ? (
              <p className="text-gray-500 italic">No hay publicaciones todavía.</p>
            ) : (
              posts.map((post) => (
                <div 
                  key={post.id}
                  onClick={() => setSelectedPost(post)}
                  className={`p-6 border cursor-pointer transition-all rounded-xl ${
                    selectedPost?.id === post.id 
                      ? 'border-anvil-red bg-white/5 shadow-lg shadow-anvil-red/5' 
                      : 'border-white/5 hover:border-white/20'
                  }`}
                >
                  <h4 className="text-lg font-bold uppercase mb-2">{post.title}</h4>
                  <div className="flex items-center gap-2 text-xs text-gray-500 uppercase font-bold">
                    <User size={12} />
                    <span>{post.author}</span>
                    <span>•</span>
                    <span>{new Date(post.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Selected Post & Comments */}
          <div className="lg:col-span-2">
            {selectedPost ? (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div className="bg-[#252525] p-8 rounded-xl shadow-xl">
                  <h3 className="text-3xl font-black uppercase mb-4">{selectedPost.title}</h3>
                  <div className="prose prose-invert max-w-none text-gray-300">
                    {selectedPost.content}
                  </div>
                </div>

                {/* Comments Section */}
                <div className="space-y-6">
                  <h4 className="text-xl font-bold uppercase flex items-center gap-2">
                    <MessageSquare size={20} className="text-anvil-red" />
                    Comentarios ({comments.length})
                  </h4>

                  {/* Add Comment Form */}
                  {user ? (
                    <form onSubmit={handleAddComment} className="flex gap-4">
                      <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Escribe un comentario..."
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-anvil-red transition-colors"
                      />
                      <button 
                        type="submit"
                        disabled={loading || !newComment.trim()}
                        className="bg-anvil-red hover:bg-red-700 disabled:bg-gray-600 text-white px-6 py-2 rounded-xl font-bold uppercase flex items-center gap-2 transition-colors"
                      >
                        <Send size={18} />
                        <span className="hidden sm:inline">Enviar</span>
                      </button>
                    </form>
                  ) : (
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-center">
                      <p className="text-gray-400 text-sm">
                        Debes <span className="text-white font-bold">iniciar sesión</span> para comentar.
                      </p>
                    </div>
                  )}

                  {/* Comments List */}
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="bg-white/5 p-4 rounded-xl border border-white/5 group">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm uppercase text-anvil-red">{comment.author}</span>
                            <span className="text-[10px] text-gray-600 font-bold uppercase">
                              {new Date(comment.created_at).toLocaleString()}
                            </span>
                          </div>
                          {user && user.id === comment.user_id && (
                            <button 
                              onClick={() => handleDeleteComment(comment.id)}
                              className="text-gray-600 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        <p className="text-gray-300 text-sm">{comment.content}</p>
                      </div>
                    ))}
                    {comments.length === 0 && (
                      <p className="text-gray-600 text-sm italic">No hay comentarios aún. ¡Sé el primero!</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center border border-dashed border-white/10 p-12 text-center">
                <p className="text-gray-500 uppercase tracking-widest font-bold">
                  Selecciona una noticia para leer y comentar
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
