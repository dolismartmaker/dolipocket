<!doctype html>
<html lang="fr">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
	<meta name="theme-color" content="#1f2937">
	<title>{{ $title ?? 'Dolipocket' }}</title>
	<link rel="icon" href="/dolipocket/public/favicon.ico" type="image/x-icon">
	<link rel="stylesheet" href="/dolipocket/public/assets/app.css">
</head>
<body class="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">

	<header class="bg-slate-900 text-white">
		<div class="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
			<a href="/" class="font-semibold text-lg">Dolipocket</a>
			<nav class="text-sm space-x-4">
				<a href="/pricing" class="hover:underline">Tarifs</a>
				@if (!empty($auth['login']))
					<a href="/logout" class="hover:underline">Déconnexion</a>
				@else
					<a href="/login" class="hover:underline">Connexion</a>
					<a href="/signup" class="bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-3 py-1 rounded font-medium">Créer un compte</a>
				@endif
			</nav>
		</div>
	</header>

	<main class="max-w-3xl mx-auto px-4 py-8">
		@yield('content')
	</main>

	<footer class="border-t border-slate-200 mt-12">
		<div class="max-w-3xl mx-auto px-4 py-6 text-sm text-slate-500 flex justify-between">
			<span>&copy; {{ date('Y') }} Dolipocket</span>
			<span class="space-x-4">
				<a href="/legal" class="hover:underline">Mentions légales</a>
				<a href="/terms" class="hover:underline">CGU</a>
			</span>
		</div>
	</footer>

	<script>
	document.addEventListener('submit', function(e) {
		var form = e.target;
		if (!form.matches('form[data-submit-once]')) return;
		if (form.dataset.submitted === '1') {
			e.preventDefault();
			return;
		}
		form.dataset.submitted = '1';
		var btn = form.querySelector('button[type="submit"], input[type="submit"]');
		if (btn) {
			btn.disabled = true;
			var loadingText = btn.dataset.loadingText;
			if (loadingText) {
				if (btn.tagName === 'BUTTON') {
					btn.dataset.originalText = btn.innerHTML;
					btn.innerHTML = loadingText;
				} else {
					btn.dataset.originalText = btn.value;
					btn.value = loadingText;
				}
			}
		}
	});
	</script>
</body>
</html>
