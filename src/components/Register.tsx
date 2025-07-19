

const RegisterUsername = ({registerUser, customId, setCustomId}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center mb-10 text-gray-700">Welcome to Video Call hello phil</h2>
        <div className="space-y-4">
          <div className="mb-4">
            <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-1">
              Choose your username
            </label>
            <input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>
          <button 
            onClick={registerUser} 
            className="w-full bg-[#155dfc] hover:bg-blue-700 text-white px-6 py-3 rounded-lg text-lg font-medium transition-colors"
          >
            Register User
          </button>
        </div>
      </div>
    </div>
  )
} 

export default RegisterUsername;