import React, { useState, useEffect, useRef } from 'react';
import { X, ZoomIn, MapPin, Upload, Trash2, Lock, Unlock } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';

// --- LIVE FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIza" + "SyBEiM4TJYIjFj4uQQMKM05uAVarxN6f8ik",
  authDomain: "gi-reception-e-gallery.firebaseapp.com",
  projectId: "gi-reception-e-gallery",
  storageBucket: "gi-reception-e-gallery.firebasestorage.app",
  messagingSenderId: "462787555752",
  appId: "1:462787555752:web:b5aa4bda0704f48badad9d",
  measurementId: "G-7TXSKPZV1H"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [user, setUser] = useState(null);
  const [artworks, setArtworks] = useState([]);
  const [selectedArt, setSelectedArt] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Admin & Security State
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentView, setCurrentView] = useState('landing');
  
  // Form State
  const [newArt, setNewArt] = useState({ title: '', artist: '', location: '', description: '', imageBase64: '' });
  const fileInputRef = useRef(null);

  // Hardcoded PIN for the prototype
  const CORRECT_PIN = "1234";

  // --- Setup Authentication & Data Fetching ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Authentication failed:", error);
      }
    };
    initAuth();

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    // --- LIVE DATABASE PATH ---
    const artworksRef = collection(db, 'artworks');
    const unsubscribeData = onSnapshot(artworksRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setArtworks(data);
      setIsLoaded(true);
    }, (error) => {
      console.error("Error fetching artworks:", error);
    });

    return () => unsubscribeData();
  }, [user]);

  // Lock body scroll when modals are open
  useEffect(() => {
    document.body.style.overflow = (selectedArt || showPinModal) ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; }
  }, [selectedArt, showPinModal]);

  // --- Security Logic ---
  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (pinInput === CORRECT_PIN) {
      setIsAdmin(true);
      setShowPinModal(false);
      setPinInput('');
      setPinError(false);
      setCurrentView('gallery'); // Jump straight to gallery upon login
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  const toggleAdmin = () => {
    if (isAdmin) {
      setIsAdmin(false); // Logout directly
    } else {
      setShowPinModal(true); // Require PIN to login
    }
  };

  // --- Image Handling & Uploading Logic ---
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        setNewArt(prev => ({ ...prev, imageBase64: base64 }));
      };
    };
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!newArt.imageBase64 || !newArt.title || !newArt.artist) return;
    
    setIsUploading(true);
    try {
      const artworksRef = collection(db, 'artworks');
      await addDoc(artworksRef, { ...newArt, createdAt: Date.now() });
      setNewArt({ title: '', artist: '', location: '', description: '', imageBase64: '' });
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error("Error uploading artwork:", error);
    }
    setIsUploading(false);
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if(window.confirm("Are you sure you want to remove this photo from the gallery?")) {
      try {
        await deleteDoc(doc(db, 'artworks', id));
      } catch (error) {
        console.error("Error deleting artwork:", error);
      }
    }
  };

// --- WEEKLY FEATURED ARTWORK LOGIC ---
  const getWeeklyFeatured = (allArtworks) => {
    // If there are 3 or fewer photos in the gallery, just show them all
    if (allArtworks.length <= 3) return allArtworks;
    
    // Create a unique ID for the current week (changes exactly once every 7 days)
    const currentWeekId = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7)).toString();
    
    // Create a weekly "shuffled" list
    return [...allArtworks].sort((a, b) => {
      // Calculate a unique score based on the photo's ID and the current week ID
      const scoreA = (a.id + currentWeekId).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const scoreB = (b.id + currentWeekId).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
      
      // Scramble the score so it feels truly random
      const randomA = Math.sin(scoreA) * 10000;
      const randomB = Math.sin(scoreB) * 10000;
      
      return (randomA - Math.floor(randomA)) - (randomB - Math.floor(randomB));
    }).slice(0, 3);
  };

  const featuredArtworks = getWeeklyFeatured(artworks);

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800 flex flex-col selection:bg-stone-200">
      {currentView === 'landing' ? (
        /* --- LANDING PAGE VIEW --- */
        <div className="flex-grow flex flex-col animate-in fade-in duration-700">
          {/* Hero Banner - Museum Style */}
          <div className="bg-stone-900 text-stone-50 relative flex-shrink-0">
             <div className="max-w-4xl mx-auto px-4 py-20 md:py-32 text-center relative z-10 flex flex-col items-center">
               <div className="w-12 h-px bg-stone-600 mb-8"></div>
               <h1 className="text-4xl md:text-6xl font-serif mb-6 tracking-tight leading-tight">
                 The Reception Gallery
               </h1>
               <p className="text-stone-400 text-lg md:text-xl max-w-2xl mx-auto font-light leading-relaxed mb-8">
                 A curated collection of moments captured by our team. Take a breath, explore, and find a moment of peace.
               </p>
               <div className="w-12 h-px bg-stone-600"></div>
             </div>
          </div>

          {/* Featured Artworks */}
          <div className="flex-grow max-w-6xl mx-auto px-4 py-16 w-full flex flex-col items-center">
             <h2 className="text-xs font-bold text-stone-400 uppercase tracking-[0.2em] mb-12 text-center flex items-center gap-4">
               <span className="w-12 h-px bg-stone-300"></span>
               Featured Exhibition
               <span className="w-12 h-px bg-stone-300"></span>
             </h2>
             
             {artworks.length === 0 && isLoaded ? (
               <div className="text-center py-10 text-stone-400 font-serif italic">The exhibition is currently being prepared.</div>
             ) : (
               <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 md:gap-12 mb-20 w-full transition-opacity duration-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
                 {featuredArtworks.map((art) => (
                   <div 
                     key={art.id}
                     onClick={() => setSelectedArt(art)}
                     className="group cursor-pointer flex flex-col"
                   >
                     {/* Museum "Mat Board" Frame */}
                     <div className="bg-white p-3 md:p-4 shadow-sm border border-stone-100 transition-all duration-500 group-hover:shadow-xl group-hover:-translate-y-1 mb-4">
                       <div className="aspect-[4/5] overflow-hidden bg-stone-100 relative">
                         <img src={art.imageBase64} alt={art.title} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" loading="lazy" />
                         {/* Subtle overlay for zooming icon on hover */}
                         <div className="absolute inset-0 bg-stone-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                            <div className="bg-white/90 p-3 rounded-full text-stone-800 scale-90 group-hover:scale-100 transition-transform duration-300">
                              <ZoomIn size={20} />
                            </div>
                         </div>
                       </div>
                     </div>
                     {/* Gallery Label */}
                     <div className="px-2 text-center">
                       <h3 className="font-serif text-xl text-stone-900 mb-1">{art.title}</h3>
                       <p className="text-stone-500 text-xs uppercase tracking-widest">{art.artist}</p>
                     </div>
                   </div>
                 ))}
               </div>
             )}

             {/* Call to Action */}
             <button 
               onClick={() => {
                 setCurrentView('gallery');
                 window.scrollTo({ top: 0, behavior: 'smooth' });
               }}
               className="mt-auto group flex flex-col items-center gap-4 text-stone-500 hover:text-stone-900 transition-colors pb-8"
             >
               <span className="text-lg md:text-xl font-serif italic tracking-wide">Enter the full gallery</span>
               <div className="w-10 h-10 border border-stone-300 rounded-full flex items-center justify-center group-hover:border-stone-900 group-hover:bg-stone-900 group-hover:text-white transition-all duration-500">
                 <span className="transform group-hover:translate-y-1 transition-transform duration-300">↓</span>
               </div>
             </button>
          </div>
        </div>
      ) : (
        /* --- FULL GALLERY VIEW --- */
        <div className="flex-grow flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Header */}
          <header className="bg-white/90 backdrop-blur-md sticky top-0 z-10 border-b border-stone-200">
            <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
              <button 
                onClick={() => {
                  setCurrentView('landing');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="text-stone-400 hover:text-stone-900 flex items-center gap-2 text-sm font-medium transition-colors uppercase tracking-wider"
              >
                <span className="text-lg leading-none mb-0.5">←</span> Exit
              </button>
              <h1 className="text-lg font-serif text-stone-800 tracking-wide">
                Full Collection
              </h1>
              <div className="w-16"></div> {/* Spacer for centering */}
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-grow max-w-6xl mx-auto px-4 py-12 w-full">
            
            {/* Admin Dashboard */}
            {isAdmin && (
              <div className="bg-white p-6 md:p-8 shadow-sm border border-stone-200 mb-16 relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-stone-900"></div>
                <div className="flex justify-between items-center mb-8 border-b border-stone-100 pb-4">
                  <h2 className="text-xl font-serif flex items-center gap-2 text-stone-800">
                    <Upload size={20} className="text-stone-400" /> Curate Exhibition
                  </h2>
                  <span className="bg-stone-100 text-stone-600 text-[10px] font-bold px-3 py-1 uppercase tracking-widest border border-stone-200">
                    Staff Mode Active
                  </span>
                </div>
                
                <form onSubmit={handleUpload} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Artwork Title *</label>
                      <input 
                        type="text" required
                        value={newArt.title} onChange={e => setNewArt({...newArt, title: e.target.value})}
                        className="w-full px-4 py-3 bg-stone-50 border border-stone-200 focus:bg-white focus:ring-1 focus:ring-stone-900 focus:border-stone-900 outline-none transition-all font-serif text-lg"
                        placeholder="e.g., Morning Walk"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Photographer *</label>
                      <input 
                        type="text" required
                        value={newArt.artist} onChange={e => setNewArt({...newArt, artist: e.target.value})}
                        className="w-full px-4 py-3 bg-stone-50 border border-stone-200 focus:bg-white focus:ring-1 focus:ring-stone-900 focus:border-stone-900 outline-none transition-all"
                        placeholder="e.g., Dr. Smith"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Location</label>
                      <input 
                        type="text"
                        value={newArt.location} onChange={e => setNewArt({...newArt, location: e.target.value})}
                        className="w-full px-4 py-3 bg-stone-50 border border-stone-200 focus:bg-white focus:ring-1 focus:ring-stone-900 focus:border-stone-900 outline-none transition-all"
                        placeholder="e.g., Yellowstone National Park"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Artist's Statement (Optional)</label>
                      <textarea 
                        value={newArt.description} onChange={e => setNewArt({...newArt, description: e.target.value})}
                        className="w-full px-4 py-3 bg-stone-50 border border-stone-200 focus:bg-white focus:ring-1 focus:ring-stone-900 focus:border-stone-900 outline-none resize-none transition-all"
                        rows="3" placeholder="Context or feelings regarding this photograph..."
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Digital File *</label>
                      <input 
                        type="file" accept="image/*" required ref={fileInputRef} onChange={handleImageChange}
                        className="block w-full text-sm text-stone-500 file:mr-4 file:py-2.5 file:px-6 file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-wider file:bg-stone-900 file:text-white hover:file:bg-stone-700 file:cursor-pointer file:transition-colors cursor-pointer"
                      />
                      {newArt.imageBase64 && (
                        <div className="mt-6 relative aspect-video w-full md:w-1/2 overflow-hidden bg-stone-100 border border-stone-200 p-2">
                          <img src={newArt.imageBase64} alt="Preview" className="w-full h-full object-contain" />
                          <button 
                            type="button" 
                            onClick={() => { setNewArt({...newArt, imageBase64: ''}); if(fileInputRef.current) fileInputRef.current.value = ''; }} 
                            className="absolute top-4 right-4 bg-white/90 text-stone-900 p-2 rounded-full hover:bg-white shadow-sm transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <button 
                    type="submit" disabled={isUploading || !newArt.imageBase64}
                    className="mt-8 px-8 py-3 bg-stone-900 text-white text-sm uppercase tracking-widest hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-full md:w-auto shadow-sm"
                  >
                    {isUploading ? 'Uploading...' : 'Publish to Gallery'}
                  </button>
                </form>
              </div>
            )}

            {/* Empty State */}
            {!isAdmin && artworks.length === 0 && isLoaded && (
              <div className="text-center py-32 text-stone-400">
                <p className="text-xl font-serif italic mb-2">The gallery walls are currently bare.</p>
                <p className="text-sm uppercase tracking-widest text-stone-400">Please return later</p>
              </div>
            )}

            {/* Gallery Grid */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 transition-opacity duration-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
              {artworks.map((art) => (
                <div 
                  key={art.id}
                  onClick={() => setSelectedArt(art)}
                  className="group cursor-pointer flex flex-col relative"
                >
                  {/* Admin Delete Button on Photos */}
                  {isAdmin && (
                    <button 
                      onClick={(e) => handleDelete(art.id, e)}
                      className="absolute top-2 right-2 z-10 bg-red-500 text-white p-2 shadow-sm hover:bg-red-600 transition-colors md:opacity-0 md:group-hover:opacity-100"
                      title="Remove Artwork"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}

                  <div className="bg-white p-2 shadow-sm border border-stone-100 transition-all duration-500 group-hover:shadow-lg group-hover:-translate-y-1 mb-3">
                    <div className="aspect-square overflow-hidden bg-stone-100 relative">
                      <img 
                        src={art.imageBase64} 
                        alt={art.title}
                        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-stone-900/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                         <ZoomIn size={24} className="text-white drop-shadow-md scale-90 group-hover:scale-100 transition-transform duration-300" />
                      </div>
                    </div>
                  </div>
                  <div className="px-1">
                    <h3 className="font-serif text-lg text-stone-900 leading-tight mb-0.5">{art.title}</h3>
                    <p className="text-stone-500 text-[10px] uppercase tracking-widest">{art.artist}</p>
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>
      )}

      {/* Footer & Admin Toggle */}
      <footer className="w-full py-12 mt-auto border-t border-stone-200 bg-stone-100/50">
        <div className="max-w-6xl mx-auto px-4 flex flex-col items-center">
          <div className="w-8 h-px bg-stone-300 mb-6"></div>
          <button 
            onClick={toggleAdmin}
            className="text-stone-400 hover:text-stone-800 flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-widest transition-colors"
          >
            {isAdmin ? <Unlock size={14} /> : <Lock size={14} />}
            {isAdmin ? "Close Exhibition Panel" : "Staff Access"}
          </button>
        </div>
      </footer>

      {/* PIN Security Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-300 border-t-4 border-stone-900">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-serif text-stone-900 mb-1">Staff Authentication</h3>
                <p className="text-xs text-stone-500 uppercase tracking-wider">Restricted Area</p>
              </div>
              <button onClick={() => { setShowPinModal(false); setPinError(false); setPinInput(''); }} className="text-stone-400 hover:text-stone-900 transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handlePinSubmit}>
              <input
                type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoFocus
                value={pinInput} onChange={(e) => setPinInput(e.target.value)} placeholder="••••"
                className={`w-full text-center tracking-[1em] text-3xl px-4 py-4 border-b-2 bg-stone-50 outline-none transition-colors font-mono ${
                  pinError ? 'border-red-400 text-red-700' : 'border-stone-300 focus:border-stone-900 text-stone-800'
                }`}
              />
              {pinError && <p className="text-red-500 text-xs mt-3 text-center uppercase tracking-wider">Authentication Failed</p>}
              
              <button type="submit" className="w-full mt-8 bg-stone-900 text-white text-sm uppercase tracking-widest py-4 hover:bg-stone-800 transition-colors">
                Verify Credential
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox / Modal */}
      {selectedArt && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12 bg-stone-900/95 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setSelectedArt(null)}
        >
          <button 
            className="absolute top-4 right-4 md:top-8 md:right-8 z-50 text-stone-400 hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); setSelectedArt(null); }}
          >
            <X size={32} />
          </button>

          <div 
            className="bg-white w-full max-w-6xl max-h-[90vh] flex flex-col md:flex-row shadow-2xl animate-in zoom-in-95 duration-400"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image Section */}
            <div className="w-full md:w-2/3 bg-stone-100 relative flex items-center justify-center p-4 md:p-8 min-h-[40vh]">
              <img 
                src={selectedArt.imageBase64} 
                alt={selectedArt.title}
                className="w-full h-full max-h-[80vh] object-contain shadow-sm"
              />
            </div>

            {/* Museum Plaque / Details Section */}
            <div className="w-full md:w-1/3 p-8 md:p-12 flex flex-col bg-white overflow-y-auto border-l border-stone-100">
              
              <h2 className="text-3xl md:text-4xl font-serif text-stone-900 mb-4 leading-tight">
                {selectedArt.title}
              </h2>
              
              <div className="mb-8">
                <p className="text-sm text-stone-900 uppercase tracking-widest font-bold mb-1">
                  {selectedArt.artist}
                </p>
                {selectedArt.location && (
                  <p className="text-xs text-stone-500 uppercase tracking-widest flex items-center gap-1.5 mt-2">
                    <MapPin size={12} /> {selectedArt.location}
                  </p>
                )}
              </div>
              
              <div className="w-12 h-px bg-stone-300 mb-8"></div>
              
              {selectedArt.description && (
                <p className="text-stone-600 font-serif text-lg leading-relaxed italic mb-8">
                  "{selectedArt.description}"
                </p>
              )}
              
              <div className="mt-auto border border-stone-200 p-5 bg-stone-50/50">
                <p className="text-[10px] text-stone-500 uppercase tracking-widest leading-relaxed text-center">
                  Curated Collection <br/> The Reception Gallery
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
