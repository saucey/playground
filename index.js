const express    = require('express');
const app        = express();

app.get('/', (req, res) => {
  res.send('hello from my server with new hook pleaseeee!');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
}); 