import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../constants/app_constants.dart';

class AppLocalizations {
  const AppLocalizations(this.locale);

  final Locale locale;

  static const supportedLocales = [
    Locale('rw'),
    Locale('fr'),
    Locale('en'),
  ];

  static const delegate = _AppLocalizationsDelegate();
  static const delegates = [delegate];
  static const materialDelegate = _MaterialLocalizationsDelegate();
  static const widgetsDelegate = _WidgetsLocalizationsDelegate();
  static const cupertinoDelegate = _CupertinoLocalizationsDelegate();

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations) ??
        const AppLocalizations(Locale('rw'));
  }

  bool get isFrench => locale.languageCode == 'fr';
  bool get isEnglish => locale.languageCode == 'en';

  String _t({required String rw, required String fr, required String en}) {
    if (isFrench) return fr;
    if (isEnglish) return en;
    return rw;
  }

  String get languageName => _t(rw: 'Kinyarwanda', fr: 'Francais', en: 'English');
  String languageLabel(Locale locale) => switch (locale.languageCode) {
        'fr' => 'Francais',
        'en' => 'English',
        _ => 'Kinyarwanda',
      };
  String get settings => _t(rw: 'Igenamiterere', fr: 'Parametres', en: 'Settings');
  String get notifications => _t(rw: 'Imenyesha', fr: 'Notifications', en: 'Notifications');
  String get locationPermission => _t(rw: 'Uruhushya rwo kumenya aho uri', fr: 'Autorisation de localisation', en: 'Location permission');
  String get language => _t(rw: 'Ururimi', fr: 'Langue', en: 'Language');
  String get appearance => _t(rw: 'Imigaragarire', fr: 'Apparence', en: 'Appearance');
  String get security => _t(rw: 'Umutekano', fr: 'Securite', en: 'Security');
  String get privacyPolicy => _t(rw: 'Politiki y’ibanga', fr: 'Politique de confidentialite', en: 'Privacy Policy');
  String get termsOfService => _t(rw: 'Amategeko yo gukoresha', fr: 'Conditions d’utilisation', en: 'Terms of Service');
  String get locationNotice => _t(rw: 'FEM C@BS ikoresha aho uri neza kugira ngo iguhuza n’abashoferi no gukurikirana urugendo ruri gukorwa. Aya makuru ntashorwa.', fr: 'FEM C@BS utilise votre position precise pour vous mettre en relation avec les chauffeurs et suivre un trajet actif. Ces donnees ne sont jamais vendues.', en: 'FEM C@BS uses your precise location to match you with drivers and track an active ride. This data is never sold.');
  String get locationDialogTitle => _t(rw: 'Uruhushya rwo kumenya aho uri', fr: 'Autorisation de localisation', en: 'Location permission');
  String get locationDialogBody => _t(rw: 'FEM C@BS ikoresha aho uri kugira ngo yerekane aho uhera ku ikarita no gukurikirana urugendo ruri gukorwa. Ruhindure mu igenamiterere ry’igikoresho.', fr: 'FEM C@BS utilise votre position pour afficher votre point de depart sur la carte et suivre un trajet actif. Gerez-la dans les parametres de votre appareil.', en: 'FEM C@BS uses your location to show your pickup point on the map and track an active ride. Manage it in your device settings.');
  String get ok => _t(rw: 'Yego', fr: 'OK', en: 'OK');
  String get chooseLanguage => _t(rw: 'Hitamo ururimi', fr: 'Choisir la langue', en: 'Choose language');
  String get languageChanged => _t(rw: 'Ururimi rwahinduwe.', fr: 'La langue a ete modifiee.', en: 'Language changed.');
  String get welcomeBack => _t(rw: 'Murakaza neza', fr: 'Bon retour', en: 'Welcome back');
  String get loginSubtitle => _t(rw: 'Injira kugira ngo utegeke urugendo.', fr: 'Connectez-vous pour reserver votre trajet.', en: 'Log in to book your ride.');
  String get phoneOrEmail => _t(rw: 'Numero ya telefoni cyangwa imeyili', fr: 'Numero de telephone ou e-mail', en: 'Phone number or email');
  String get password => _t(rw: 'Ijambo ry’ibanga', fr: 'Mot de passe', en: 'Password');
  String get forgotPassword => _t(rw: 'Wibagiwe ijambo ry’ibanga?', fr: 'Mot de passe oublie ?', en: 'Forgot password?');
  String get login => _t(rw: 'Injira', fr: 'Se connecter', en: 'Log in');
  String get signUp => _t(rw: 'Iyandikishe', fr: 'S’inscrire', en: 'Sign up');
  String get noAccount => _t(rw: 'Nta konti ufite? ', fr: 'Vous n’avez pas de compte ? ', en: 'Don’t have an account? ');
  String get getStarted => _t(rw: 'Tangira', fr: 'Commencer', en: 'Get started');
  String get safeReliableRides => _t(rw: 'Ingendo zizewe kandi zidahenze, igihe cyose uzikeneye.', fr: 'Des trajets surs et fiables, chaque fois que vous en avez besoin.', en: 'Safe and reliable rides, whenever you need them.');
  String get enterPassword => _t(rw: 'Andika ijambo ry’ibanga', fr: 'Saisissez votre mot de passe', en: 'Enter your password');
  String get previewMode => _t(rw: 'Uburyo bwo kureba: serivisi yo kwinjira ntirahuza. Kwinjira bikorera kuri iki gikoresho gusa.', fr: 'Mode apercu : le service d’authentification n’est pas encore connecte. La connexion fonctionne uniquement sur cet appareil.', en: 'Preview mode: the authentication backend is not connected, so sign-in runs on this device only.');
  String get signInFailed => _t(rw: 'Kwinjira ntibishobotse ubu. Ongera ugerageze.', fr: 'Connexion impossible pour le moment. Veuillez reessayer.', en: 'We could not sign you in right now. Please try again.');
  String get previewSignedIn => _t(rw: 'Winjiye mu buryo bwo kureba (serivisi ntirahuza).', fr: 'Session apercu activee (service non connecte).', en: 'Signed in with a preview session (backend not connected yet).');
  String get tagline => _t(rw: 'Urugendo rwawe. Uburyo bwawe.', fr: 'Votre trajet. Votre choix.', en: 'Your ride. Your way.');
  String get home => _t(rw: 'Ahabanza', fr: 'Accueil', en: 'Home');
  String get activity => _t(rw: 'Ibikorwa', fr: 'Activite', en: 'Activity');
  String get profile => _t(rw: 'Umwirondoro', fr: 'Profil', en: 'Profile');
  String get existingAccount => _t(rw: 'Usanzwe ufite konti? ', fr: 'Vous avez deja un compte ? ', en: 'Already have an account? ');
  String get whereGoing => _t(rw: 'Ugiye he?', fr: 'Ou allez-vous ?', en: 'Where are you going?');
  String get pickup => _t(rw: 'Aho uhera', fr: 'Depart', en: 'Pickup');
  String get destination => _t(rw: 'Aho ujya', fr: 'Destination', en: 'Destination');
  String get chooseDestination => _t(rw: 'Hitamo aho ujya', fr: 'Choisir une destination', en: 'Choose destination');
  String get setPickup => _t(rw: 'Shyiraho aho uhera', fr: 'Definir le depart', en: 'Set pickup location');
  String get useCurrentLocation => _t(rw: 'Koresha aho ndi ubu', fr: 'Utiliser ma position actuelle', en: 'Use current location');
  String get findingLocation => _t(rw: 'Turashaka aho uri…', fr: 'Recherche de votre position…', en: 'Finding your location…');
  String get setupRide => _t(rw: 'Tegura urugendo', fr: 'Configurer le trajet', en: 'Set up ride');
  String get bookRide => _t(rw: 'Tegura urugendo', fr: 'Reserver un trajet', en: 'Book a ride');
  String get recentDestinations => _t(rw: 'Aho uheruka kujya', fr: 'Destinations recentes', en: 'Recent destinations');
  String get chooseRide => _t(rw: 'Hitamo urugendo', fr: 'Choisir un trajet', en: 'Choose a ride');
  String get vehicleOptions => _t(rw: 'Amahitamo y’imodoka', fr: 'Options de vehicule', en: 'Vehicle options');
  String get continueLabel => _t(rw: 'Komeza', fr: 'Continuer', en: 'Continue');
  String get rideSummary => _t(rw: 'Incamake y’urugendo', fr: 'Resume du trajet', en: 'Ride summary');
  String get confirmRide => _t(rw: 'Emeza urugendo', fr: 'Confirmer le trajet', en: 'Confirm your ride');
  String get paymentMethod => _t(rw: 'Uburyo bwo kwishyura', fr: 'Mode de paiement', en: 'Payment method');
  String get vehicle => _t(rw: 'Imodoka', fr: 'Vehicule', en: 'Vehicle');
  String get searchDestination => _t(rw: 'Shakisha aho ujya', fr: 'Rechercher une destination', en: 'Search for a destination');
  String get savedPlaces => _t(rw: 'Aho wabitswe', fr: 'Lieux enregistres', en: 'Saved places');
  String get recentPlaces => _t(rw: 'Aho uheruka', fr: 'Lieux recents', en: 'Recent places');
  String get typeAddress => _t(rw: 'Andika aderesi cyangwa ubike aho ukunze kujya.', fr: 'Saisissez une adresse ou enregistrez vos lieux frequents.', en: 'Start typing an address, or save places you use often.');
  String get back => _t(rw: 'Subira inyuma', fr: 'Retour', en: 'Back');
  String get previewBuild => _t(rw: 'Verisiyo yo kureba — serivisi ntirahuza', fr: 'Version apercu — service non connecte', en: 'Preview build — backend not connected');
  String get goodMorning => _t(rw: 'Mwaramutse', fr: 'Bonjour', en: 'Good morning');
  String get goodAfternoon => _t(rw: 'Mwiriwe', fr: 'Bon apres-midi', en: 'Good afternoon');
  String get goodEvening => _t(rw: 'Mwiriwe neza', fr: 'Bonsoir', en: 'Good evening');
  String get there => _t(rw: 'ahongaho', fr: 'la', en: 'there');
  String get invalidIdentifier => _t(rw: 'Andika nimero ya telefoni cyangwa imeyili yemewe', fr: 'Saisissez un numero de telephone ou e-mail valide', en: 'Enter a valid phone number or email');
  String get identifierRequired => _t(rw: 'Andika nimero ya telefoni cyangwa imeyili', fr: 'Saisissez votre numero de telephone ou e-mail', en: 'Enter your phone number or email');
  String get light => _t(rw: 'Urumuri', fr: 'Clair', en: 'Light');
  String get dark => _t(rw: 'Umwijima', fr: 'Sombre', en: 'Dark');
  String get system => _t(rw: 'Sisitemu', fr: 'Systeme', en: 'System');
  String get appearanceNotice => _t(rw: 'Uburyo bw’umwijima burategurwa. Porogaramu iri mu buryo bw’urumuri.', fr: 'Le mode sombre arrive. L’application est actuellement en mode clair.', en: 'Dark mode is coming. The app is in Light mode today.');
  String get securityTitle => _t(rw: 'Umutekano', fr: 'Securite', en: 'Security');
  String get securityBody => _t(rw: 'Kwinjira, kode za OTP no gusubizamo ijambo ry’ibanga bikorwa mu mutekano. Gufungura ukoresheje urutoki na kode bizongerwaho nyuma.', fr: 'La connexion, les codes OTP et la reinitialisation du mot de passe sont securises. Le deverrouillage biometrique sera ajoute plus tard.', en: 'Login, OTP codes and password resets are handled securely. Biometric unlock and passcode will be added in a security update.');
  String get allowLocation => _t(rw: 'Emera kumenya aho uri', fr: 'Autoriser la localisation', en: 'Allow location access');
  String get locationExplanation => _t(rw: 'FEM C@BS ikoresha aho uri kugira ngo ibone aho uhera kandi ifashe umushoferi kukugeraho. Ushobora kwandika aho uhera ubwawe.', fr: 'FEM C@BS utilise votre position pour trouver votre depart et aider le chauffeur a vous rejoindre. Vous pouvez aussi saisir le depart manuellement.', en: 'FEM C@BS uses your location to find your pickup point and help your driver reach you. You can still enter your pickup manually.');
  String get notNow => _t(rw: 'Ntabwo ari ubu', fr: 'Pas maintenant', en: 'Not now');
  String get allow => _t(rw: 'Emera aho uri', fr: 'Autoriser', en: 'Allow location');

  String get createAccount => _t(rw: 'Fungura konti yawe', fr: 'Creer votre compte', en: 'Create your account');
  String get lessThanMinute => _t(rw: 'Bifata munsi y’umunota.', fr: 'Cela prend moins d’une minute.', en: 'It takes less than a minute.');
  String get fullName => _t(rw: 'Amazina yose', fr: 'Nom complet', en: 'Full name');
  String get phoneNumber => _t(rw: 'Numero ya telefoni', fr: 'Numero de telephone', en: 'Phone number');
  String get email => _t(rw: 'Imeyili', fr: 'E-mail', en: 'Email');
  String get confirmPassword => _t(rw: 'Emeza ijambo ry’ibanga', fr: 'Confirmer le mot de passe', en: 'Confirm password');
  String get passwordHint => _t(rw: 'Nibura inyuguti 8, harimo inyuguti n’imibare', fr: 'Au moins 8 caracteres, lettres et chiffres', en: 'At least 8 characters, letters and numbers');
  String get agreeTerms => _t(rw: 'Ndemera Amategeko yo gukoresha na Politiki y’ibanga', fr: 'J’accepte les Conditions d’utilisation et la Politique de confidentialite', en: 'I agree to the Terms of Service and Privacy Policy');
  String get accountCreatedFailed => _t(rw: 'Ntitwashoboye gukora konti ubu. Ongera ugerageze.', fr: 'Nous ne pouvons pas creer votre compte maintenant. Reessayez.', en: 'We could not create your account right now. Please try again.');
  String get forgotPasswordDescription => _t(rw: 'Andika imeyili cyangwa numero ya telefoni, tukohereze kode yo gusubizamo ijambo ry’ibanga.', fr: 'Saisissez votre e-mail ou numero de telephone et nous vous enverrons un code de verification.', en: 'Enter your email or phone number and we will send you a verification code to reset your password.');
  String get emailOrPhone => _t(rw: 'Imeyili cyangwa numero ya telefoni', fr: 'E-mail ou numero de telephone', en: 'Email or phone number');
  String get sendVerification => _t(rw: 'Ohereza igenzura', fr: 'Envoyer la verification', en: 'Send verification');
  String get checkPhoneOrEmail => _t(rw: 'Reba telefoni cyangwa imeyili yawe', fr: 'Consultez votre telephone ou e-mail', en: 'Check your phone or email');
  String get codeArrivalHint => _t(rw: 'Niba kode itaje, genzura numero wanditse.', fr: 'Si le code n’arrive pas, verifiez le numero saisi.', en: 'If the code does not arrive, double-check the number you entered.');
  String get backToLogin => _t(rw: 'Subira ku kwinjira', fr: 'Retour a la connexion', en: 'Back to log in');
  String get completeProfile => _t(rw: 'Uzuza umwirondoro wawe', fr: 'Completez votre profil', en: 'Complete your profile');
  String get profilePhotoHint => _t(rw: 'Ifoto y’umwirondoro izongerwaho igihe kohereza amafoto bizaba bihujwe na serivisi.', fr: 'Une photo de profil pourra etre ajoutee lorsque les telechargements seront connectes au serveur.', en: 'A profile photo can be added when uploads are connected to the backend.');
  String get emergencyContactOptional => _t(rw: 'Umuntu wahamagara mu gihe cy’amage (si ngombwa)', fr: 'Contact d’urgence (facultatif)', en: 'Emergency contact (optional)');
  String get emergencyContactHint => _t(rw: 'Dukoresha ibi gusa kugira ngo tumuhamagare mu gihe cy’amage.', fr: 'Nous l’utilisons uniquement pour le joindre en cas d’urgence.', en: 'We only use this to reach someone for you in an emergency.');
  String get emergencyContactName => _t(rw: 'Amazina y’uwo wahamagara', fr: 'Nom du contact d’urgence', en: 'Emergency contact name');
  String get emergencyContactPhone => _t(rw: 'Numero y’uwo wahamagara', fr: 'Telephone du contact d’urgence', en: 'Emergency contact phone');
  String get continueLabel2 => continueLabel;
  String get welcomeAboard => _t(rw: 'Murakaza neza (uburyo bwo kureba).', fr: 'Bienvenue (session d’aperçu).', en: 'Welcome aboard (preview session).');
  String get verifyAccount => _t(rw: 'Emeza konti yawe', fr: 'Verifiez votre compte', en: 'Verify your account');
  String get verificationCodeSent => _t(rw: 'Andika kode yo kwemeza twohereje kuri telefoni yawe.', fr: 'Saisissez le code de verification envoye a votre telephone.', en: 'Enter the verification code we sent to your phone.');
  String get verify => _t(rw: 'Emeza', fr: 'Verifier', en: 'Verify');
  String resendCodeIn(int seconds) => _t(rw: 'Ongera wohereze kode mu masegonda ${seconds}', fr: 'Renvoyer le code dans ${seconds} s', en: 'Resend code in ${seconds}s');
  String get resendCode => _t(rw: 'Ongera wohereze kode', fr: 'Renvoyer le code', en: 'Resend code');
  String get newCodeRequested => _t(rw: 'Hasabwe kode nshya (uburyo bwo kureba: nta butumwa bwoherejwe).', fr: 'Un nouveau code a ete demande (aperçu : aucun message reel n’a ete envoye).', en: 'A new code has been requested (development preview: no real message was sent yet).');
  String get invalidVerificationCode => _t(rw: 'Andika kode twohereje kuri telefoni yawe.', fr: 'Saisissez le code envoye a votre telephone.', en: 'Enter the code we sent to your phone.');
  String get verificationFailed => _t(rw: 'Ntitwashoboye kwemeza kode ubu. Ongera ugerageze.', fr: 'Nous ne pouvons pas verifier votre code maintenant. Reessayez.', en: 'We could not verify your code right now. Please try again.');
  String get completed => _t(rw: 'Byarangiye', fr: 'Terminee', en: 'Completed');
  String get cancelled => _t(rw: 'Byahagaritswe', fr: 'Annulee', en: 'Cancelled');
  String get work => _t(rw: 'Akazi', fr: 'Travail', en: 'Work');
  String get other => _t(rw: 'Ahandi', fr: 'Autre', en: 'Other');
  String get payDriverDirectly => _t(rw: 'Ishyura umushoferi ako kanya', fr: 'Payez directement le chauffeur', en: 'Pay the driver directly');
  String get payWithMomo => _t(rw: 'Ishyura ukoresheje MoMo', fr: 'Payez avec MoMo', en: 'Pay with MoMo');
  String get payWithAirtel => _t(rw: 'Ishyura ukoresheje Airtel Money', fr: 'Payez avec Airtel Money', en: 'Pay with Airtel Money');
  String get payWithCard => _t(rw: 'Ishyura ukoresheje ikarita ya banki', fr: 'Payez avec une carte bancaire', en: 'Pay with a bank card');
  String get driverFound => _t(rw: 'Umushoferi yabonetse', fr: 'Chauffeur trouve', en: 'Driver found');
  String get waitingDriver => _t(rw: 'Dutegereje guhabwa umushoferi', fr: 'En attente de l’attribution d’un chauffeur', en: 'Waiting for driver assignment');
  String get driverDetailsPending => _t(rw: 'Amakuru y’umushoferi azagaragara serivisi imaze kumugenera urugendo.', fr: 'Les informations du chauffeur apparaitront des que le serveur lui attribuera votre course.', en: 'Driver details will appear here as soon as the backend assigns your driver.');
  String get driverOnWay => _t(rw: 'Umushoferi wawe ari mu nzira', fr: 'Votre chauffeur est en route', en: 'Your driver is on their way');
  String get licensePlate => _t(rw: 'Plaque: ', fr: 'Plaque : ', en: 'License plate: ');
  String get call => _t(rw: 'Hamagara', fr: 'Appeler', en: 'Call');
  String get message => _t(rw: 'Ubutumwa', fr: 'Message', en: 'Message');
  String get cancelRide => _t(rw: 'Hagarika urugendo', fr: 'Annuler la course', en: 'Cancel ride');
  String get cancelRideQuestion => _t(rw: 'Uhagarike uru rugendo?', fr: 'Annuler cette course ?', en: 'Cancel this ride?');
  String get keepRide => _t(rw: 'Komeza urugendo', fr: 'Garder la course', en: 'Keep ride');
  String get tripInProgress => _t(rw: 'Urugendo rurakomeje', fr: 'Course en cours', en: 'Trip in progress');
  String get yourOnWay => _t(rw: 'Uri mu nzira', fr: 'Vous etes en route', en: 'You’re on your way');
  String get liveTrackingPending => _t(rw: 'Gukurikirana bizagaragara serivisi imaze gutanga aho umushoferi ari.', fr: 'Le suivi en direct apparaitra lorsque le serveur transmettra la position du chauffeur.', en: 'Live tracking appears here once the backend streams driver positions.');
  String get estimatedArrival => _t(rw: 'Igihe cyo kuhagera', fr: 'Arrivee estimee', en: 'Estimated arrival');
  String inMinutes(int minutes) => _t(rw: 'Mu minota ${minutes}', fr: 'Dans ${minutes} min', en: 'In ${minutes} min');
  String get backendUnavailable => _t(rw: 'Serivisi yo guhuza abashoferi ntirahuza.', fr: 'La mise en relation avec les chauffeurs n’est pas encore connectee.', en: 'Driver matching is not connected yet');
  String get backHome => _t(rw: 'Subira ahabanza', fr: 'Retour a l’accueil', en: 'Back to home');
  String get findingDriver => _t(rw: 'Turashaka umushoferi wawe', fr: 'Recherche de votre chauffeur', en: 'Finding your driver');
  String get matchingDriver => _t(rw: 'Turaguhuza n’umushoferi uri hafi. Akenshi bifata munsi y’umunota.', fr: 'Nous vous mettons en relation avec le chauffeur disponible le plus proche. Cela prend generalement moins d’une minute.', en: 'We are matching you with the nearest available driver. This usually takes less than a minute.');
  String get requiredField => _t(rw: 'Iki gice kirakenewe', fr: 'Ce champ est requis', en: 'This field is required');
  String get fullNameRequired => _t(rw: 'Andika amazina yawe yose', fr: 'Saisissez votre nom complet', en: 'Please enter your full name');
  String get fullNameInvalid => _t(rw: 'Andika amazina yawe yose', fr: 'Saisissez votre nom complet', en: 'Enter your full name');
  String get phoneRequired => _t(rw: 'Andika numero ya telefoni', fr: 'Saisissez votre numero de telephone', en: 'Please enter your phone number');
  String get phoneInvalid => _t(rw: 'Andika numero ya telefoni yemewe', fr: 'Saisissez un numero de telephone valide', en: 'Enter a valid phone number');
  String get emailRequired => _t(rw: 'Andika imeyili yawe', fr: 'Saisissez votre e-mail', en: 'Please enter your email');
  String get emailInvalid => _t(rw: 'Andika imeyili yemewe', fr: 'Saisissez une adresse e-mail valide', en: 'Enter a valid email address');
  String get passwordRequired => _t(rw: 'Andika ijambo ry’ibanga', fr: 'Saisissez un mot de passe', en: 'Please enter a password');
  String get passwordShort => _t(rw: 'Ijambo ry’ibanga rigomba kugira nibura inyuguti 8', fr: 'Le mot de passe doit contenir au moins 8 caracteres', en: 'Password must be at least 8 characters');
  String get passwordLetter => _t(rw: 'Ijambo ry’ibanga rigomba kugira inyuguti', fr: 'Le mot de passe doit contenir une lettre', en: 'Password must contain a letter');
  String get passwordNumber => _t(rw: 'Ijambo ry’ibanga rigomba kugira umubare', fr: 'Le mot de passe doit contenir un chiffre', en: 'Password must contain a number');
  String get confirmPasswordRequired => _t(rw: 'Emeza ijambo ry’ibanga', fr: 'Confirmez votre mot de passe', en: 'Please confirm your password');
  String get passwordMismatch => _t(rw: 'Amagambo y’ibanga ntahura', fr: 'Les mots de passe ne correspondent pas', en: 'Passwords do not match');
  String resetMessage(String identifier) => _t(
        rw: 'Twohereje ubutumwa bwo kwemeza kuri $identifier (uburyo bwo kureba: nta butumwa bwoherejwe).',
        fr: 'Nous avons envoye un message de verification a $identifier (version d’aperçu : aucun message reel n’a ete envoye).',
        en: 'We sent a verification message to $identifier (development build - no message was actually sent).',
      );
  String verificationCodeLength(int length) => _t(
        rw: 'Andika kode yo kwemeza y’imibare $length.',
        fr: 'Saisissez le code de verification a $length chiffres.',
        en: 'Enter the $length-digit verification code.',
      );

  static Future<Locale> loadSavedLocale() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString(AppConstants.prefLocaleKey) ?? 'rw';
    if (code == 'fr') return const Locale('fr');
    if (code == 'en') return const Locale('en');
    return const Locale('rw');
  }
}

class AppLocaleController extends ChangeNotifier {
  Locale _locale = const Locale('rw');

  Locale get locale => _locale;

  Future<void> initialize() async {
    _locale = await AppLocalizations.loadSavedLocale();
    notifyListeners();
  }

  Future<void> setLocale(Locale locale) async {
    if (!AppLocalizations.supportedLocales.contains(locale)) return;
    _locale = locale;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.prefLocaleKey, locale.languageCode);
  }
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      AppLocalizations.supportedLocales.any(
        (supported) => supported.languageCode == locale.languageCode,
      );

  @override
  Future<AppLocalizations> load(Locale locale) async {
    return AppLocalizations(locale);
  }

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

class _MaterialLocalizationsDelegate
    extends LocalizationsDelegate<MaterialLocalizations> {
  const _MaterialLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      AppLocalizations.supportedLocales.any(
        (supported) => supported.languageCode == locale.languageCode,
      );

  @override
  Future<MaterialLocalizations> load(Locale locale) {
    return GlobalMaterialLocalizations.delegate.load(
      locale.languageCode == 'fr' ? locale : const Locale('en'),
    );
  }

  @override
  bool shouldReload(_MaterialLocalizationsDelegate old) => false;
}

class _WidgetsLocalizationsDelegate
    extends LocalizationsDelegate<WidgetsLocalizations> {
  const _WidgetsLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      AppLocalizations.supportedLocales.any(
        (supported) => supported.languageCode == locale.languageCode,
      );

  @override
  Future<WidgetsLocalizations> load(Locale locale) {
    return GlobalWidgetsLocalizations.delegate.load(
      locale.languageCode == 'fr' ? locale : const Locale('en'),
    );
  }

  @override
  bool shouldReload(_WidgetsLocalizationsDelegate old) => false;
}

class _CupertinoLocalizationsDelegate
    extends LocalizationsDelegate<CupertinoLocalizations> {
  const _CupertinoLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      AppLocalizations.supportedLocales.any(
        (supported) => supported.languageCode == locale.languageCode,
      );

  @override
  Future<CupertinoLocalizations> load(Locale locale) {
    return GlobalCupertinoLocalizations.delegate.load(
      locale.languageCode == 'fr' ? locale : const Locale('en'),
    );
  }

  @override
  bool shouldReload(_CupertinoLocalizationsDelegate old) => false;
}
